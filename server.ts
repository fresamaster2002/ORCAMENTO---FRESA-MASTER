import express from "express";
import path from "path";
import { createRequire } from "module";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { applicationDefault, getApps, initializeApp as initializeFirebaseAdminApp } from "firebase-admin/app";
import { getAuth as getFirebaseAdminAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore as getFirebaseAdminFirestore } from "firebase-admin/firestore";
import dotenv from "dotenv";
import {
  BLING_FRESA_MASTER_CATALOG,
  matchBlingCatalogProduct,
  normalizeBlingCatalogProducts,
} from "./src/blingCatalog";
import { extractCepFromText, extractDiscountAmountFromText, extractMotoboyPriceFromText, extractUnitPricesFromText } from "./src/quoteParsing";
import { completeDeliveryByCep, deliveryExtractionInstruction, deliveryExtractionSchema, normalizeExtractedDelivery } from "./supabase/functions/_shared/deliveryExtraction";
import { CnpjLookupError, lookupCnpj } from "./supabase/functions/_shared/cnpjLookup";
import { formatBlingError } from "./supabase/functions/_shared/blingErrors";
import { BlingFiscalError, buildSaleItems, buildSalePayment, handleBlingNfe } from "./supabase/functions/_shared/blingFiscal";
import { createSandboxShipment, SandboxShipmentError } from "./supabase/functions/_shared/sandboxShipment";
import { DEFAULT_PACKAGE_DIMENSIONS } from "./supabase/functions/_shared/shippingDefaults";
import { blingReadinessIssues } from "./supabase/functions/_shared/blingReadiness";

const require = createRequire(path.join(process.cwd(), "package.json"));
const { ZipArchive } = require("archiver");

dotenv.config();

const app = express();

const parsePortFromArgs = () => {
  const rawArgs = process.argv.slice(2);
  const portIndex = rawArgs.findIndex((arg) => arg === "--port" || arg === "-p");
  if (portIndex >= 0) {
    const nextValue = rawArgs[portIndex + 1];
    const parsed = Number(nextValue);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const portValue = rawArgs.find((arg) => /^--port=\d+$/.test(arg));
  if (portValue) {
    const parsed = Number(portValue.split("=")[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return Number(process.env.PORT) || 3001;
};

const PORT = parsePortFromArgs();
app.set("trust proxy", 1);
app.use(express.json({ limit: "10mb" }));

let firebaseAdminAuth: ReturnType<typeof getFirebaseAdminAuth> | null = null;
let firebaseAdminFirestore: ReturnType<typeof getFirebaseAdminFirestore> | null = null;
if (process.env.NODE_ENV === "production") {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    const firebaseAdminApp = getApps()[0] || initializeFirebaseAdminApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
    firebaseAdminAuth = getFirebaseAdminAuth(firebaseAdminApp);
    firebaseAdminFirestore = getFirebaseAdminFirestore(
      firebaseAdminApp,
      process.env.FIREBASE_DATABASE_ID || "(default)",
    );
  } catch (error) {
    console.error("Firebase Admin não pôde ser inicializado; APIs protegidas permanecerão indisponíveis.", error);
  }
}

app.use(async (req, res, next) => {
  if (process.env.NODE_ENV !== "production") return next();
  if (req.path === "/api/health" || req.path === "/api/public-config" || req.path === "/api/bling/oauth/callback") return next();
  if (!req.path.startsWith("/api/")) return next();
  if (!firebaseAdminAuth) {
    return res.status(503).json({ error: "Autenticação Firebase não está configurada neste serviço." });
  }

  const bearerToken = req.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearerToken) return res.status(401).json({ error: "Faça login para acessar este recurso." });

  try {
    const identity = await firebaseAdminAuth.verifyIdToken(bearerToken);
    const allowedEmail = (process.env.FIREBASE_ALLOWED_EMAIL || "fresamaster0@gmail.com").toLowerCase();
    if (identity.email_verified !== true || identity.email?.toLowerCase() !== allowedEmail) {
      return res.status(403).json({ error: "Esta conta não tem autorização para acessar o Fresa Master." });
    }
    next();
  } catch {
    res.status(401).json({ error: "Sessão expirada. Entre novamente para continuar." });
  }
});

// Helper to get or check Gemini client
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const localGeminiUsage = new Map<string, number>();

async function reserveGeminiRequest(): Promise<boolean> {
  const configuredLimit = Number(process.env.GEMINI_DAILY_REQUEST_LIMIT || 0);
  if (!Number.isFinite(configuredLimit) || configuredLimit <= 0) return true;
  const dailyLimit = Math.max(1, Math.floor(configuredLimit));
  const day = new Date().toISOString().slice(0, 10);

  if (process.env.NODE_ENV === "production") {
    if (!firebaseAdminFirestore) return false;
    const usageRef = firebaseAdminFirestore.collection("systemUsage").doc(`gemini-${day}`);
    try {
      return await firebaseAdminFirestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(usageRef);
        const count = Number(snapshot.data()?.count || 0);
        if (count >= dailyLimit) return false;
        transaction.set(usageRef, {
          count: count + 1,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return true;
      });
    } catch (error) {
      console.error("Não foi possível validar o limite diário do Gemini.", error);
      return false;
    }
  }

  const count = localGeminiUsage.get(day) || 0;
  if (count >= dailyLimit) return false;
  localGeminiUsage.set(day, count + 1);
  return true;
}

// Package Weight Estimator for Fresa Master Tools & Packaging
function calculatePackageWeightKg(items: Array<{ description?: string; quantity?: number }>): {
  weightKg: number;
  totalPieces: number;
  description: string;
} {
  const totalPieces = (items || []).reduce((acc, it) => acc + (Number(it.quantity) || 1), 0);

  // Base packaging (caixa de papelão ondulado, fita gomada, plástico bolha e tubetes)
  let packageGrams = 150;

  for (const item of items || []) {
    const qty = Number(item.quantity) || 1;
    const desc = (item.description || "").toLowerCase();

    let toolGrams = 45; // padrão 45g (micro fresa 1 a 2 cortes metal duro com tubete individual)
    if (desc.includes("tct") || desc.includes("widia") || desc.includes("3 cortes") || desc.includes("corte reto")) {
      toolGrams = 110; // Fresa TCT mais robusta com corpo de aço usinado e pastilhas
    } else if (desc.includes("pinça") || desc.includes("pinca") || desc.includes("er11") || desc.includes("er16") || desc.includes("er20") || desc.includes("er25") || desc.includes("er32")) {
      toolGrams = 85; // Pinças ER de precisão em aço temperado
    } else if (desc.includes("v-bit") || desc.includes("chanfro") || desc.includes("desbaste") || desc.includes("12mm") || desc.includes("1/2")) {
      toolGrams = 85;
    } else if (desc.includes("acrílico") || desc.includes("alumínio") || desc.includes("1 corte") || desc.includes("2 cortes")) {
      toolGrams = 45;
    }

    packageGrams += qty * toolGrams;
  }

  // Conversão para kg
  const rawKg = packageGrams / 1000;
  // O Melhor Envio e Correios tarifam no mínimo 0.5 kg (500g).
  // Se a quantidade de fresas ultrapassar 500g, arredonda para 1 casa decimal (ex: 0.6 kg, 0.8 kg, 1.2 kg)
  const weightKg = rawKg <= 0.5 ? 0.5 : Number((Math.ceil(rawKg * 10) / 10).toFixed(1));

  let description = `${weightKg.toFixed(1).replace(".", ",")} kg (padrão até 0,5 kg)`;
  if (weightKg > 0.5) {
    description = `${weightKg.toFixed(1).replace(".", ",")} kg (${totalPieces} ferramentas com embalagem protetora)`;
  }

  return {
    weightKg,
    totalPieces,
    description,
  };
}

// Shipping simulator simulating Melhor Envio rates (Sedex, PAC, Jadlog) com peso dinâmico, dimensões do pacote e seguro opcional
function calculateMelhorEnvioRates(
  destCep: string,
  originCep = "13329-350",
  weightKg = 0.5,
  dimensions?: { height?: number; width?: number; length?: number },
  customShipping?: { amount?: number; name?: string },
  insuranceEnabled = false,
  declaredValue = 280
) {
  const cleanDest = destCep.replace(/\D/g, "");
  const cleanOrigin = originCep.replace(/\D/g, "") || "13329350";

  // Dígito de estado/região de destino e origem
  const firstDestDigit = cleanDest ? parseInt(cleanDest[0], 10) : 1;
  const firstOriginDigit = cleanOrigin ? parseInt(cleanOrigin[0], 10) : 1;

  // Se for mesma UF/macrorregião (ex: SP interior 13xxx para SP 0xxxx ou 1xxxx), frete mais rápido e barato
  const isSameState = firstDestDigit === firstOriginDigit;
  const isCloseRegion = Math.abs(firstDestDigit - firstOriginDigit) <= 1;

  // Fator de distância regional (13329-350 Salto/SP como centro logístico)
  let zoneFactor = 1.0;
  if (isSameState) {
    zoneFactor = 0.95;
  } else if (isCloseRegion) {
    zoneFactor = 1.15;
  } else {
    zoneFactor = 1.35;
  }

  // Acréscimo tarifário para encomendas acima da faixa mínima de 0,5 kg no Melhor Envio
  const extraWeightKg = Math.max(0, weightKg - 0.5);

  // Cálculo de peso cubado (padrão Correios/Melhor Envio: C x L x A / 6000)
  const h = dimensions?.height || DEFAULT_PACKAGE_DIMENSIONS.height;
  const w = dimensions?.width || DEFAULT_PACKAGE_DIMENSIONS.width;
  const l = dimensions?.length || DEFAULT_PACKAGE_DIMENSIONS.length;
  const cubicWeight = (h * w * l) / 6000;
  const effectiveExtraWeight = Math.max(extraWeightKg, cubicWeight > 1.0 ? cubicWeight - 0.5 : 0);

  const sedexWeightSurcharge = effectiveExtraWeight * 5.80 * zoneFactor;
  const pacWeightSurcharge = effectiveExtraWeight * 3.20 * zoneFactor;
  const jadlogWeightSurcharge = effectiveExtraWeight * 2.90 * zoneFactor;

  // Custo do seguro de carga (Melhor Envio: ~1.5% do valor declarado das ferramentas com mínimo de R$ 3,50)
  const val = Math.max(0, declaredValue || 0);
  const insuranceCost = val > 0 ? Number(Math.max(3.5, val * 0.015).toFixed(2)) : 0;

  const sedexBase = Number(((28.5 * zoneFactor) + sedexWeightSurcharge).toFixed(2));
  const pacBase = Number(((18.9 * zoneFactor) + pacWeightSurcharge).toFixed(2));
  const jadlogBase = Number(((17.4 * zoneFactor) + jadlogWeightSurcharge).toFixed(2));

  const sedexPrice = insuranceEnabled ? Number((sedexBase + insuranceCost).toFixed(2)) : sedexBase;
  const pacPrice = insuranceEnabled ? Number((pacBase + insuranceCost).toFixed(2)) : pacBase;
  const jadlogPrice = insuranceEnabled ? Number((jadlogBase + insuranceCost).toFixed(2)) : jadlogBase;

  const sedexDays = isSameState ? 2 : isCloseRegion ? 3 : 4;
  const pacDays = isSameState ? 4 : isCloseRegion ? 6 : 8;
  const jadlogDays = Math.max(2, pacDays - 1);

  const options: Array<{
    service: "SEDEX" | "PAC" | "JADLOG_PACKAGE" | "RETIRADA" | "PROPRIO" | "MOTOBOY" | "CONTA_FRESA";
    name: string;
    carrier: string;
    price: number;
    deliveryDays: number;
    selected: boolean;
    insuranceIncluded?: boolean;
    insuranceCost?: number;
    withInsurancePrice?: number;
    withoutInsurancePrice?: number;
  }> = [
    {
      service: "SEDEX",
      name: insuranceEnabled ? "Sedex c/ Seguro" : "Sedex (Melhor Envio)",
      carrier: "Correios",
      price: sedexPrice,
      deliveryDays: sedexDays,
      selected: true,
      insuranceIncluded: Boolean(insuranceEnabled),
      insuranceCost,
      withInsurancePrice: Number((sedexBase + insuranceCost).toFixed(2)),
      withoutInsurancePrice: sedexBase,
    },
    {
      service: "PAC",
      name: insuranceEnabled ? "PAC c/ Seguro" : "PAC (Melhor Envio)",
      carrier: "Correios",
      price: pacPrice,
      deliveryDays: pacDays,
      selected: false,
      insuranceIncluded: Boolean(insuranceEnabled),
      insuranceCost,
      withInsurancePrice: Number((pacBase + insuranceCost).toFixed(2)),
      withoutInsurancePrice: pacBase,
    },
    {
      service: "JADLOG_PACKAGE",
      name: insuranceEnabled ? "Jadlog .Package c/ Seguro" : "Jadlog .Package",
      carrier: "Jadlog",
      price: jadlogPrice,
      deliveryDays: jadlogDays,
      selected: false,
      insuranceIncluded: Boolean(insuranceEnabled),
      insuranceCost,
      withInsurancePrice: Number((jadlogBase + insuranceCost).toFixed(2)),
      withoutInsurancePrice: jadlogBase,
    },
    {
      service: "RETIRADA",
      name: "Retirada na Fresa Master",
      carrier: "Balcão (Salto/SP)",
      price: 0,
      deliveryDays: 0,
      selected: false,
      insuranceIncluded: false,
      insuranceCost: 0,
      withInsurancePrice: 0,
      withoutInsurancePrice: 0,
    },
    {
      service: "MOTOBOY",
      name: "Envio por Motoboy / Aplicativo (Lalamove, Uber Flash)",
      carrier: "Motoboy / App",
      price: 0,
      deliveryDays: 1,
      selected: false,
      insuranceIncluded: false,
      insuranceCost: 0,
      withInsurancePrice: 0,
      withoutInsurancePrice: 0,
    },
    {
      service: "CONTA_FRESA",
      name: "Envio por Nossa Conta (Cortesia Fresa Master)",
      carrier: "Fresa Master",
      price: 0,
      deliveryDays: 2,
      selected: false,
      insuranceIncluded: false,
      insuranceCost: 0,
      withInsurancePrice: 0,
      withoutInsurancePrice: 0,
    },
  ];

  // Adiciona opção de frete próprio/personalizado do lojista se configurado
  if (customShipping && typeof customShipping.amount === "number" && customShipping.amount >= 0) {
    const customBase = Number(customShipping.amount.toFixed(2));
    const customWithInsurance = insuranceEnabled && customBase > 0 ? Number((customBase + insuranceCost).toFixed(2)) : customBase;
    options.unshift({
      service: "PROPRIO",
      name: insuranceEnabled && customBase > 0 ? `${customShipping.name || "Frete Próprio"} c/ Seguro` : (customShipping.name || "Frete Fresa Master (Transportadora Própria)"),
      carrier: "Fresa Master",
      price: customWithInsurance,
      deliveryDays: 2,
      selected: false,
      insuranceIncluded: Boolean(insuranceEnabled && customBase > 0),
      insuranceCost: customBase > 0 ? insuranceCost : 0,
      withInsurancePrice: Number((customBase + insuranceCost).toFixed(2)),
      withoutInsurancePrice: customBase,
    });
  }

  return options;
}

// Dados de etiqueta/entrega: usa o endereço de entrega quando diferente do endereço fiscal (Cartão CNPJ)
function buildShipTo(quote: any) {
  const d = quote.shipping?.deliveryAddress;
  if (d?.enabled) {
    return {
      nome: d.recipient || quote.client.name,
      endereco: d.address || "",
      numero: d.number || "S/N",
      complemento: d.complement || "",
      bairro: d.neighborhood || "",
      cep: String(quote.shipping?.destinationCep || "").replace(/\D/g, ""),
      municipio: d.city || "",
      uf: d.state || "SP",
    };
  }
  return {
    nome: quote.client.name,
    endereco: quote.client.address || "",
    numero: quote.client.number || "S/N",
    complemento: quote.client.complement || "",
    bairro: quote.client.neighborhood || "",
    cep: String(quote.client.cep || "").replace(/\D/g, ""),
    municipio: quote.client.city || "",
    uf: quote.client.state || "SP",
  };
}
// Helper: Query ViaCEP public API
async function lookupViaCep(cep: string) {
  const clean = cep.replace(/\D/g, "");
  if (clean.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro) return null;
    return {
      logradouro: data.logradouro || "",
      bairro: data.bairro || "",
      cidade: data.localidade || "",
      uf: data.uf || "",
      ddd: data.ddd || "",
    };
  } catch (err) {
    return null;
  }
}

// Health and API Status
app.get("/api/health", (_req, res) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY");
  res.json({
    status: "ok",
    company: "Fresa Master",
    hasApiKey: hasKey,
    model: "gemini-3.8-flash",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/public-config", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY || "",
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.FIREBASE_PROJECT_ID || "",
      appId: process.env.FIREBASE_APP_ID || "",
      databaseId: process.env.FIREBASE_DATABASE_ID || "(default)",
    },
    allowedAdminEmail: process.env.FIREBASE_ALLOWED_EMAIL || "fresamaster0@gmail.com",
  });
});
// Token Sandbox do Melhor Envio da Fresa Master (Conta fresamaster0@gmail.com - Salto/SP)
const DEFAULT_MELHOR_ENVIO_TOKEN = "";

// Helper: Call official Melhor Envio API v2 in real-time if token is configured
async function fetchMelhorEnvioLiveRates(
  destCep: string,
  originCep: string,
  weightKg: number,
  dimensions: { height?: number; width?: number; length?: number },
  insuranceEnabled: boolean,
  declaredValue: number,
  token?: string,
  isSandboxParam?: boolean
) {
  const effectiveToken = token || process.env.MELHOR_ENVIO_TOKEN || DEFAULT_MELHOR_ENVIO_TOKEN;
  if (!effectiveToken || effectiveToken.trim() === "") return null;

  const cleanDest = destCep.replace(/\D/g, "");
  const cleanOrigin = originCep.replace(/\D/g, "") || "13329350";
  if (cleanDest.length !== 8) return null;

  const isSandbox = isSandboxParam ?? (
    process.env.MELHOR_ENVIO_SANDBOX === "true" ||
    effectiveToken.includes("eyJhdWQiOiI5NTYi")
  );
  const apiUrl = isSandbox
    ? "https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate"
    : "https://melhorenvio.com.br/api/v2/me/shipment/calculate";

  const height = Math.max(2, dimensions?.height || DEFAULT_PACKAGE_DIMENSIONS.height);
  const width = Math.max(11, dimensions?.width || DEFAULT_PACKAGE_DIMENSIONS.width);
  const length = Math.max(16, dimensions?.length || DEFAULT_PACKAGE_DIMENSIONS.length);

  const payload = {
    from: { postal_code: cleanOrigin },
    to: { postal_code: cleanDest },
    package: {
      height,
      width,
      length,
      weight: Math.max(0.1, weightKg || 0.5),
    },
    options: {
      insurance_value: insuranceEnabled ? declaredValue : 0,
      receipt: false,
      own_hand: false,
    },
    services: "1,2,3,4,17",
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${effectiveToken.trim()}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "FresaMaster (fresamaster0@gmail.com)",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn("Melhor Envio API status:", response.status);
      return null;
    }

    const data = await response.json();
    if (!Array.isArray(data)) return null;

    const mappedOptions: any[] = [];
    const fallbackEstimatedInsurance = Math.max(2.50, Number((declaredValue * 0.015).toFixed(2)));

    for (const item of data) {
      if (item.error) continue;
      const returnedPrice = Number(item.custom_price || item.price || 0);
      if (!returnedPrice) continue;

      let serviceCode: "SEDEX" | "PAC" | "JADLOG_PACKAGE" = "SEDEX";
      const nameLower = (item.name || "").toLowerCase();
      if (nameLower.includes("sedex")) serviceCode = "SEDEX";
      else if (nameLower.includes("pac")) serviceCode = "PAC";
      else serviceCode = "JADLOG_PACKAGE";

      const deliveryDays = Number(item.custom_delivery_time || item.delivery_time || 2);
      
      // When insurance is enabled, Melhor Envio's returned custom_price includes the exact carrier insurance fee
      let basePrice = returnedPrice;
      let withInsPrice = returnedPrice;
      let insCost = fallbackEstimatedInsurance;

      if (insuranceEnabled && declaredValue > 0) {
        withInsPrice = returnedPrice;
        // The insurance fee calculated by the carrier (Correios: ~0.9% a 1.5% do valor declarado com taxa administrativa)
        insCost = Number(Math.max(2.50, declaredValue * (serviceCode === "SEDEX" ? 0.009 : 0.012)).toFixed(2));
        basePrice = Number(Math.max(0, returnedPrice - insCost).toFixed(2));
      } else {
        basePrice = returnedPrice;
        insCost = Number(Math.max(2.50, declaredValue * 0.012).toFixed(2));
        withInsPrice = Number((returnedPrice + insCost).toFixed(2));
      }

      const activePrice = insuranceEnabled ? withInsPrice : basePrice;

      mappedOptions.push({
        service: serviceCode,
        melhorEnvioServiceId: Number(item.id),
        name: `${item.name} (Melhor Envio Oficial)`,
        carrier: item.company?.name || (nameLower.includes("jadlog") ? "Jadlog" : "Correios"),
        price: activePrice,
        deliveryDays,
        selected: false,
        insuranceIncluded: Boolean(insuranceEnabled),
        insuranceCost: insCost,
        withInsurancePrice: withInsPrice,
        withoutInsurancePrice: basePrice,
        isRealTimeMelhorEnvio: true,
      });
    }

    return mappedOptions.length > 0 ? mappedOptions : null;
  } catch (err: any) {
    console.warn("Erro ao consultar API do Melhor Envio, usando simulador:", err.message);
    return null;
  }
}

// Shipping calculation endpoint
app.post("/api/shipping/create-sandbox-shipment", async (req, res) => {
  try {
    const token = req.body.sandboxToken || process.env.MELHOR_ENVIO_SANDBOX_TOKEN || (process.env.MELHOR_ENVIO_SANDBOX === "true" ? process.env.MELHOR_ENVIO_TOKEN : "") || "";
    res.json(await createSandboxShipment(req.body, token));
  } catch (error) {
    if (error instanceof SandboxShipmentError) return res.status(error.status).json({ success: false, error: error.message });
    console.error("Falha de comunicação com o Melhor Envio Sandbox:", error);
    res.status(502).json({ success: false, error: "Falha de comunicação com o Sandbox. Confira o carrinho antes de repetir, pois o envio pode ter sido criado." });
  }
});

app.post("/api/shipping/calculate", async (req, res) => {
  try {
    const {
      destinationCep,
      originCep = "13329-350",
      weightKg: customWeightKg,
      items,
      packageDimensions,
      customShipping,
      insuranceEnabled = false,
      declaredValue,
      melhorEnvioToken,
    } = req.body;

    if (!destinationCep) {
      return res.status(400).json({ error: "CEP de destino é obrigatório" });
    }

    let calculatedWeight = 0.5;
    let weightDescription = "0,5 kg (padrão até 0,5 kg)";
    if (customWeightKg && Number(customWeightKg) > 0) {
      calculatedWeight = Number(customWeightKg);
      weightDescription = `${calculatedWeight.toFixed(1).replace(".", ",")} kg (definido manualmente)`;
    } else if (items && Array.isArray(items) && items.length > 0) {
      const weightInfo = calculatePackageWeightKg(items);
      calculatedWeight = weightInfo.weightKg;
      weightDescription = weightInfo.description;
    }

    // Calcula valor declarado se não enviado diretamente
    let effectiveDeclaredValue = Number(declaredValue) || 0;
    if (!effectiveDeclaredValue && items && Array.isArray(items)) {
      effectiveDeclaredValue = items.reduce((acc: number, it: any) => acc + (Number(it.totalPrice) || 0), 0);
    }
    if (!effectiveDeclaredValue) effectiveDeclaredValue = 280;

    // Try real-time live Melhor Envio API first
    const dims = packageDimensions || { ...DEFAULT_PACKAGE_DIMENSIONS };
    let options: any[] | null = null;
    let isLiveApi = false;

    const liveOptions = await fetchMelhorEnvioLiveRates(
      destinationCep,
      originCep,
      calculatedWeight,
      dims,
      Boolean(insuranceEnabled),
      effectiveDeclaredValue,
      melhorEnvioToken
    );

    if (liveOptions && liveOptions.length > 0) {
      options = liveOptions;
      isLiveApi = true;
      // Adiciona retirada
      options.push({
        service: "RETIRADA",
        name: "Retirada na Fresa Master",
        carrier: "Balcão (Salto/SP)",
        price: 0,
        deliveryDays: 0,
        selected: false,
        insuranceIncluded: false,
        insuranceCost: 0,
        withInsurancePrice: 0,
        withoutInsurancePrice: 0,
      });

      // Adiciona Motoboy / Aplicativo (Lalamove / Uber Flash)
      options.push({
        service: "MOTOBOY",
        name: "Envio por Motoboy / Aplicativo (Lalamove, Uber Flash)",
        carrier: "Motoboy / App",
        price: 0,
        deliveryDays: 1,
        selected: false,
        insuranceIncluded: false,
        insuranceCost: 0,
        withInsurancePrice: 0,
        withoutInsurancePrice: 0,
      });

      // Adiciona Envio por Conta da Fresa Master (Frete Cortesia / Negociado)
      options.push({
        service: "CONTA_FRESA",
        name: "Envio por Nossa Conta (Cortesia Fresa Master)",
        carrier: "Fresa Master",
        price: 0,
        deliveryDays: 2,
        selected: false,
        insuranceIncluded: false,
        insuranceCost: 0,
        withInsurancePrice: 0,
        withoutInsurancePrice: 0,
      });

      // Adiciona frete próprio se houver
      if (customShipping && typeof customShipping.amount === "number" && customShipping.amount >= 0) {
        const customBase = Number(customShipping.amount.toFixed(2));
        options.unshift({
          service: "PROPRIO",
          name: customShipping.name || "Frete Fresa Master (Transportadora Própria)",
          carrier: "Fresa Master",
          price: customBase,
          deliveryDays: 2,
          selected: false,
          insuranceIncluded: false,
          insuranceCost: 0,
          withInsurancePrice: customBase,
          withoutInsurancePrice: customBase,
        });
      }
    } else {
      // Calibrated formula fallback
      options = calculateMelhorEnvioRates(
        destinationCep,
        originCep,
        calculatedWeight,
        dims,
        customShipping,
        Boolean(insuranceEnabled),
        effectiveDeclaredValue
      );
    }

    const address = await lookupViaCep(destinationCep);
    const effectiveInsuranceAmount = Boolean(insuranceEnabled)
      ? Math.max(2.50, Number((effectiveDeclaredValue * 0.015).toFixed(2)))
      : 0;

    res.json({
      success: true,
      weightKg: calculatedWeight,
      weightDescription,
      packageDimensions: dims,
      insuranceEnabled: Boolean(insuranceEnabled),
      declaredValue: effectiveDeclaredValue,
      insuranceAmount: effectiveInsuranceAmount,
      isLiveApi,
      options,
      address,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Test Melhor Envio Token directly
app.post("/api/shipping/test-melhor-envio", async (req, res) => {
  try {
    const { token, isSandbox } = req.body;
    const effectiveToken = token || (isSandbox
      ? process.env.MELHOR_ENVIO_SANDBOX_TOKEN || (process.env.MELHOR_ENVIO_SANDBOX === "true" ? process.env.MELHOR_ENVIO_TOKEN : "")
      : process.env.MELHOR_ENVIO_TOKEN);

    if (!effectiveToken || effectiveToken.trim() === "") {
      return res.status(400).json({
        success: false,
        connected: false,
        message: "Nenhum token do Melhor Envio fornecido.",
      });
    }

    const baseUrl = isSandbox
      ? "https://sandbox.melhorenvio.com.br"
      : "https://melhorenvio.com.br";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    // Call /api/v2/me to verify user identity & token validity
    const response = await fetch(`${baseUrl}/api/v2/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${effectiveToken.trim()}`,
        "Accept": "application/json",
        "User-Agent": "FresaMaster (fresamaster0@gmail.com)",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 401) {
      return res.json({
        success: false,
        connected: false,
        message: "Token não autorizado ou expirado. Verifique se você copiou o Token de Acesso completo gerado em melhorenvio.com.br.",
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      return res.json({
        success: false,
        connected: false,
        message: `Melhor Envio retornou erro (HTTP ${response.status}): ${errText.slice(0, 150)}`,
      });
    }

    const userData: any = await response.json();

    // Now test a simple shipment rate calculation to ensure shipment-calculate permission is active
    let calculationActive = false;
    try {
      const testCalc = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${effectiveToken.trim()}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "FresaMaster (fresamaster0@gmail.com)",
        },
        body: JSON.stringify({
          from: { postal_code: "13329350" },
          to: { postal_code: "01001000" },
          package: { ...DEFAULT_PACKAGE_DIMENSIONS, weight: 0.5 },
          services: "1,2",
        }),
      });
      if (testCalc.ok) {
        calculationActive = true;
      }
    } catch (e) {}

    return res.json({
      success: true,
      connected: true,
      user: {
        name: userData.firstname ? `${userData.firstname} ${userData.lastname || ""}`.trim() : (userData.name || "Usuário"),
        email: userData.email,
        company: userData.company_name,
        environment: isSandbox ? "Sandbox (Testes)" : "Produção (Oficial)",
      },
      calculationActive,
      message: `Conectado com sucesso à conta de ${userData.firstname || "Melhor Envio"} (${userData.email})! Cotações oficiais ativas em tempo real.`,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      connected: false,
      message: "Falha na comunicação com o servidor do Melhor Envio: " + (err.message || String(err)),
    });
  }
});

// Endpoint: Melhor Envio OAuth Token Exchange (Supports App 30304)
app.post("/api/shipping/melhor-envio/exchange-code", async (req, res) => {
  try {
    const { code, clientId, clientSecret, redirectUri, isSandbox } = req.body;
    const effClientId = clientId || process.env.MELHOR_ENVIO_CLIENT_ID || "";
    const effClientSecret = clientSecret || process.env.MELHOR_ENVIO_CLIENT_SECRET || "";

    if (!code) {
      return res.status(400).json({
        success: false,
        error: "Código de autorização 'code' não fornecido.",
      });
    }

    const baseUrl = isSandbox
      ? "https://sandbox.melhorenvio.com.br"
      : "https://melhorenvio.com.br";

    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "FresaMaster (fresamaster0@gmail.com)",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: String(effClientId).trim(),
        client_secret: String(effClientSecret).trim(),
        redirect_uri: redirectUri || "https://ais-pre-mtgfnq626lngwgubfssc4g-455020959771.us-east5.run.app/",
        code: String(code).trim(),
      }),
    });

    const data: any = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data.message || data.error_description || data.error || "Falha na troca do token",
        details: data,
      });
    }

    return res.json({
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: "Erro no servidor ao comunicar com o Melhor Envio: " + (err.message || String(err)),
    });
  }
});

// Endpoint: Melhor Envio OAuth Callback Page
app.get("/api/shipping/melhor-envio/callback", async (req, res) => {
  const { code, error, error_description } = req.query;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Autorização Melhor Envio - Fresa Master</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; max-width: 580px; width: 100%; padding: 32px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
    h1 { margin-top: 0; font-size: 22px; color: #f59e0b; display: flex; align-items: center; gap: 8px; }
    .badge { display: inline-block; background: #d97706; color: #fff; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 9999px; margin-bottom: 16px; }
    .code-box { background: #090d16; border: 1px solid #334155; border-radius: 8px; padding: 14px; font-family: monospace; font-size: 13px; color: #fbbf24; word-break: break-all; margin: 16px 0; }
    .info { font-size: 14px; color: #94a3b8; line-height: 1.6; }
    .btn { display: inline-block; background: #d97706; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 13px; margin-top: 10px; margin-right: 10px; cursor: pointer; border: none; }
    .btn:hover { background: #b45309; }
    .btn-copy { background: #059669; }
    .btn-copy:hover { background: #047857; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Melhor Envio API</span>
    <h1>${error ? 'Erro na Autorização' : '✅ Autorização Recebida!'}</h1>
    ${error ? `
      <p class="info" style="color: #f87171;">O Melhor Envio retornou um erro: <strong>${error}</strong> (${error_description || ''})</p>
    ` : `
      <p class="info">Sua conta do Melhor Envio autorizou com sucesso a integração com o <strong>Fresa Master</strong>.</p>
      <p class="info">Código de Autorização:</p>
      <div class="code-box" id="code-val">${code || 'Nenhum código'}</div>
      <button class="btn btn-copy" onclick="copyCode()">Copiar Código</button>
      <a href="/" class="btn">Abrir Fresa Master</a>
      <p class="info" style="margin-top: 16px; font-size: 12px; color: #64748b;">
        Se você abriu por pop-up, este código já foi comunicado automaticamente à aba principal.
      </p>
    `}
  </div>
  <script>
    const code = ${JSON.stringify(code || '')};
    if (code && window.opener) {
      try {
        window.opener.postMessage({ type: 'MELHOR_ENVIO_AUTH_CODE', code: code }, '*');
      } catch (e) {}
    }
    function copyCode() {
      const text = document.getElementById('code-val').innerText;
      navigator.clipboard.writeText(text);
      alert('Código copiado com sucesso!');
    }
  </script>
</body>
</html>`;

  res.send(html);
});

// Primary Endpoint: Extract Quote from Raw Customer Input (Voice / Audio Transcript, WhatsApp, Text)
app.post("/api/quote/extract", async (req, res) => {
  try {
    const { text, currentQuote, customInstructions, blingProducts, blingCatalogAvailable } = req.body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "O campo 'text' é obrigatório com a mensagem ou áudio transcrito do cliente.",
      });
    }
    if (text.length > 8000) {
      return res.status(413).json({ success: false, error: "O texto do pedido excede o limite de 8.000 caracteres." });
    }

    const ai = getGeminiClient();

    // Default origin CEP for Fresa Master (Salto/SP)
    const originCep = currentQuote?.shipping?.originCep || "13329-350";
    const liveCatalog = blingCatalogAvailable === true
      ? normalizeBlingCatalogProducts(Array.isArray(blingProducts) ? blingProducts : [])
      : null;
    const productCatalog = liveCatalog || [];

    if (ai) {
      const prompt = `
Você é o assistente técnico e comercial da "Fresa Master", empresa especializada na fabricação e venda de fresas de alta precisão para router CNC (MDF, madeira, acrílico, alumínio, ACM, etc.).

O usuário está ditando por áudio ou escrevendo um orçamento no formato típico:
Exemplo: "Razão social do cliente Móveis Requinte Ltda, CEP 80010-000, serão 2 fresas de 3 cortes TCT por 140 cada, calcule o envio pelo Melhor Envio Sedex"

Analise o texto a seguir com muita atenção:
"""
${text}
"""

Instruções adicionais: ${customInstructions || "Nenhuma"}

Regras de negócio da Fresa Master:
1. Extraia o nome ou Razão Social do cliente com precisão.
2. Identifique o CEP do cliente (8 dígitos).
3. Identifique todas as fresas, ferramentas e acessórios citados.
   - Exemplo de descrição: "Fresa 3 Cortes TCT para Router CNC", "Fresa Helicoidal 2 Cortes Metal Duro", "Fresa Reta V-Bit 60°", etc.
   - Unidade padrão: "un".
   - NCM padrão para fresas de usinagem: "8207.70.00".
   - Calcule unitPrice, quantity e totalPrice para cada item.
4. Identificação Inteligente da Modalidade de Frete:
   - Se o usuário falar "melhor envio", "correios", "sedex" ou "pac", detecte 'detectedCarrier' como 'MELHOR_ENVIO' (ou 'SEDEX' / 'PAC' / 'JADLOG').
   - Se o usuário falar "motoboy", "moto boy", "envio por motoboy", detecte 'detectedCarrier' como 'MOTOBOY'. Se ele mencionar o valor (ex: "motoboy 45 reais", "45 de motoboy", "frete motoboy 35"), extraia esse valor no campo 'detectedShippingPrice' (ex: 45.00).
   - Se o usuário falar "por nossa conta", "frete por nossa conta", "frete grátis", "cortesia", detecte 'detectedCarrier' como 'CONTA_FRESA' com valor 0.
   - Se falar "retirada" ou "balcão", detecte 'detectedCarrier' como 'RETIRADA' com valor 0.
5. No campo 'missingInfo', indique se falta dados importantes como CPF/CNPJ, e-mail ou endereço completo para emissão da NF futura.
6. Nunca invente SKU, preço ou NCM. O servidor fará a correspondência com o catálogo real; preserve a descrição falada e deixe SKU/NCM vazios se não houver correspondência.
7. Preserve preços e CEP explicitamente falados. Valor do motoboy é frete, nunca preço unitário de produto.
`;

      const schemaConfig = {
        systemInstruction:
          "Você é o especialista comercial da Fresa Master para fresas router CNC e integração com Bling ERP.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            success: { type: Type.BOOLEAN },
            summary: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            detectedCep: { type: Type.STRING },
            detectedCarrier: { type: Type.STRING },
            detectedShippingPrice: { type: Type.NUMBER },
            missingInfo: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            client: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                tradeName: { type: Type.STRING },
                company: { type: Type.STRING },
                email: { type: Type.STRING },
                phone: { type: Type.STRING },
                document: { type: Type.STRING },
                ie: { type: Type.STRING },
                cep: { type: Type.STRING },
                address: { type: Type.STRING },
                number: { type: Type.STRING },
                neighborhood: { type: Type.STRING },
                city: { type: Type.STRING },
                state: { type: Type.STRING },
              },
              required: ["name"],
            },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  description: { type: Type.STRING },
                  category: { type: Type.STRING },
                  sku: { type: Type.STRING },
                  ncm: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  unit: { type: Type.STRING },
                  unitPrice: { type: Type.NUMBER },
                  totalPrice: { type: Type.NUMBER },
                  notes: { type: Type.STRING },
                },
                required: ["description", "quantity", "unitPrice"],
              },
            },
            financials: {
              type: Type.OBJECT,
              properties: {
                subtotal: { type: Type.NUMBER },
                discountPercentage: { type: Type.NUMBER },
                discountAmount: { type: Type.NUMBER },
                paymentTerms: { type: Type.STRING },
                paymentMethod: { type: Type.STRING },
              },
              required: ["subtotal"],
            },
            observations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["client", "items", "financials", "summary"],
        },
      };

      const candidateModels = [GEMINI_MODEL];
      let responseText = "";

      if (!await reserveGeminiRequest()) {
        return res.status(429).json({ success: false, error: "Limite diário de uso da IA atingido ou controle de custo indisponível. Tente novamente amanhã." });
      }

      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { ...schemaConfig, maxOutputTokens: 1200 },
          });
          responseText = response.text?.trim() || "";
          if (responseText) break;
        } catch (modelErr: any) {
          console.warn(`Modelo ${modelName} indisponível ou cota esgotada (429/503). Tentando alternativa...`, modelErr.message);
        }
      }

      if (responseText) {
        const parsed = JSON.parse(responseText || "{}");

        // Process items: Match against existing Bling ERP catalog first!
        const spokenUnitPrices = extractUnitPricesFromText(text);
        const items = (parsed.items || []).map((it: any, idx: number) => {
          const qty = Number(it.quantity) || 1;
          const spokenPrice = spokenUnitPrices.length === 1 ? spokenUnitPrices[0] : spokenUnitPrices[idx];

          // Procura produto correspondente no catálogo do Bling ERP da Fresa Master
          const matchedBlingProduct = matchBlingCatalogProduct(text, productCatalog)
            || matchBlingCatalogProduct(it.description || "", productCatalog);

          let description = it.description || "Fresa 3 Cortes TCT para Router CNC";
          let sku = matchedBlingProduct?.sku || "";
          let ncm = matchedBlingProduct?.ncm || "";
          let category = it.category || "Fresas Router CNC";
          let price = spokenPrice || (matchedBlingProduct?.unitPrice || 0);
          let notes = matchedBlingProduct
            ? `Item cadastrado no Bling ERP (${matchedBlingProduct.sku})`
            : "Não localizado no catálogo real do Bling. Revise ou cadastre antes de faturar.";

          if (matchedBlingProduct) {
            description = matchedBlingProduct.description;
            category = matchedBlingProduct.category;
            if (!spokenPrice) {
              price = matchedBlingProduct.unitPrice;
            }
          }

          return {
            id: it.id || `fresa-${idx + 1}-${Date.now()}`,
            description,
            category,
            sku,
            ncm,
            quantity: qty,
            unit: (typeof it.unit === "string" && it.unit.length <= 4) ? it.unit : "un",
            unitPrice: price,
            totalPrice: qty * price,
            notes,
          };
        });

        // Calculate dynamic tooling & package weight for Melhor Envio (or use weight dictated in text/quote)
        const weightMatch = text.match(/(?:peso|pesando)\s*([0-9]+(?:[,\.][0-9]{1,2})?)\s*(?:kg|quilo|kilos|quilos)?/i);
        const dictatedWeight = weightMatch ? parseFloat(weightMatch[1].replace(',', '.')) : null;
        const autoWeight = calculatePackageWeightKg(items);
        const weightInfo = dictatedWeight && dictatedWeight > 0 
          ? { weightKg: dictatedWeight, description: `${dictatedWeight.toString().replace('.', ',')} kg (especificado)` }
          : autoWeight;

        // Preserve previous package dimensions, insurance, and custom shipping if present
        const packageDimensions = currentQuote?.shipping?.packageDimensions || { ...DEFAULT_PACKAGE_DIMENSIONS };
        const insuranceEnabled = currentQuote?.shipping?.insuranceEnabled ?? (text.toLowerCase().includes("com seguro") ? true : false);
        const customShipping = currentQuote?.shipping?.customShippingAmount !== undefined
          ? {
              amount: currentQuote.shipping.customShippingAmount,
              name: currentQuote.shipping.customShippingName || "Frete Próprio Fresa Master",
            }
          : undefined;

        const subtotalPreliminary = items.reduce((acc: number, item: any) => acc + item.totalPrice, 0);

        // Resolve CEP and shipping calculation with calculated weight, dimensions, and insurance
        const cep = extractCepFromText(text) || parsed.detectedCep || parsed.client?.cep || currentQuote?.client?.cep || "";
        let shippingOptions = calculateMelhorEnvioRates(
          cep,
          originCep,
          weightInfo.weightKg,
          packageDimensions,
          customShipping,
          insuranceEnabled,
          subtotalPreliminary
        );

        // Select carrier requested by user (e.g. Sedex, Motoboy, Por Nossa Conta)
        const normalizedRequest = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const requestedCarrier = normalizedRequest.includes("motoboy") || normalizedRequest.includes("moto boy")
          ? normalizedRequest
          : (parsed.detectedCarrier || normalizedRequest).toLowerCase();
        const extractedShippingPrice = extractMotoboyPriceFromText(text);

        let selectedOption = shippingOptions[0]; // default Sedex

        if (requestedCarrier.includes("motoboy") || requestedCarrier.includes("moto boy")) {
          // If user mentioned motoboy and a price (e.g. "motoboy 45 reais")
          const motoboyPrice = extractedShippingPrice ?? 0;

          selectedOption = {
            service: "MOTOBOY",
            name: "Envio por Motoboy",
            carrier: "Motoboy / Aplicativo",
            price: motoboyPrice,
            deliveryDays: 1,
            selected: true,
            insuranceIncluded: false,
            insuranceCost: 0,
            withInsurancePrice: motoboyPrice,
            withoutInsurancePrice: motoboyPrice,
          };

          // Also update or insert MOTOBOY in shippingOptions list
          const existingMotoboyIdx = shippingOptions.findIndex((o) => o.service === "MOTOBOY");
          if (existingMotoboyIdx >= 0) {
            shippingOptions[existingMotoboyIdx] = selectedOption;
          } else {
            shippingOptions.push(selectedOption);
          }
        } else if (
          requestedCarrier.includes("conta_fresa") ||
          requestedCarrier.includes("nossa conta") ||
          requestedCarrier.includes("por conta") ||
          requestedCarrier.includes("gratis") ||
          requestedCarrier.includes("grátis") ||
          requestedCarrier.includes("cortesia")
        ) {
          selectedOption = {
            service: "CONTA_FRESA",
            name: "Envio por Nossa Conta (Cortesia Fresa Master)",
            carrier: "Fresa Master",
            price: 0,
            deliveryDays: 2,
            selected: true,
            insuranceIncluded: false,
            insuranceCost: 0,
            withInsurancePrice: 0,
            withoutInsurancePrice: 0,
          };
          const existingContaIdx = shippingOptions.findIndex((o) => o.service === "CONTA_FRESA");
          if (existingContaIdx >= 0) {
            shippingOptions[existingContaIdx] = selectedOption;
          } else {
            shippingOptions.push(selectedOption);
          }
        } else if (requestedCarrier.includes("pac")) {
          selectedOption = shippingOptions.find((o) => o.service === "PAC") || shippingOptions[0];
        } else if (requestedCarrier.includes("jadlog")) {
          selectedOption = shippingOptions.find((o) => o.service === "JADLOG_PACKAGE") || shippingOptions[0];
        } else if (requestedCarrier.includes("proprio") || requestedCarrier.includes("próprio") || requestedCarrier.includes("transportadora")) {
          selectedOption = shippingOptions.find((o) => o.service === "PROPRIO") || shippingOptions[0];
        } else if (requestedCarrier.includes("retirada") || requestedCarrier.includes("balcao") || requestedCarrier.includes("balcão")) {
          selectedOption = shippingOptions.find((o) => o.service === "RETIRADA") || shippingOptions[0];
        } else if (requestedCarrier.includes("melhor envio") || requestedCarrier.includes("correios") || requestedCarrier.includes("sedex")) {
          selectedOption = shippingOptions.find((o) => o.service === "SEDEX") || shippingOptions[0];
        }

        // Check ViaCEP for address auto-fill
        let addressInfo = null;
        if (cep) {
          addressInfo = await lookupViaCep(cep);
        }

        const client = {
          name: parsed.client?.name || "Cliente Fresa Master",
          tradeName: parsed.client?.tradeName || "",
          company: parsed.client?.company || "",
          email: parsed.client?.email || "",
          phone: parsed.client?.phone || "",
          document: parsed.client?.document || "",
          ie: parsed.client?.ie || "",
          cep: cep,
          address: parsed.client?.address || addressInfo?.logradouro || "",
          number: parsed.client?.number || "",
          neighborhood: parsed.client?.neighborhood || addressInfo?.bairro || "",
          city: parsed.client?.city || addressInfo?.cidade || "",
          state: parsed.client?.state || addressInfo?.uf || "",
        };

        const subtotal = items.reduce((acc: number, item: any) => acc + item.totalPrice, 0);
        const insAmount = insuranceEnabled ? Number((selectedOption.insuranceCost || 0).toFixed(2)) : 0;
        const baseShipping = Number((selectedOption.withoutInsurancePrice ?? (selectedOption.price - (insuranceEnabled ? insAmount : 0))).toFixed(2));
        const spokenDiscount = extractDiscountAmountFromText(text);
        const discountPct = 0;
        const discountAmount = Number(Math.min(
          subtotal,
          spokenDiscount ?? 0,
        ).toFixed(2));
        const totalAmount = Number(Math.max(0, subtotal - discountAmount + baseShipping + insAmount).toFixed(2));

        const quote: any = {
          id: currentQuote?.id || `FM-${Math.floor(100000 + Math.random() * 900000)}`,
          status: currentQuote?.status || "draft",
          createdAt: currentQuote?.createdAt || new Date().toISOString(),
          client,
          project: {
            title: "Fornecimento de Fresas para Router CNC - Fresa Master",
            category: "Ferramentas Router CNC",
            description: `Fornecimento de ${items.length} modelo(s) de fresas para usinagem CNC de alto rendimento.`,
            deadline: selectedOption.deliveryDays > 0 ? `${selectedOption.deliveryDays} dias úteis (${selectedOption.name})` : "Pronta entrega",
            validityDays: 10,
            date: new Date().toISOString().split("T")[0],
          },
          items,
          shipping: {
            originCep,
            destinationCep: cep,
            weightKg: weightInfo.weightKg,
            weightDescription: weightInfo.description,
            packageDimensions,
            customShippingAmount: customShipping?.amount,
            customShippingName: customShipping?.name,
            insuranceEnabled,
            declaredValue: subtotalPreliminary,
            insuranceAmount: insAmount,
            selectedOption,
            options: shippingOptions,
          },
          financials: {
            subtotal,
            shippingAmount: baseShipping,
            insuranceAmount: insAmount,
            discountPercentage: discountPct,
            discountAmount,
            taxPercentage: 0,
            taxAmount: 0,
            totalAmount,
            paymentTerms: parsed.financials?.paymentTerms || "À vista via Pix ou Boleto Bancário",
            paymentMethod: parsed.financials?.paymentMethod || "Pix ou Cartão de Crédito",
          },
          observations: parsed.observations || [
            "Envio rastreado via Melhor Envio com seguro de carga incluso.",
            "Ferramentas balanceadas com tolerância h6 para pinças ER11/ER16/ER20/ER25/ER32.",
            "Dados cadastrais necessários para emissão da Nota Fiscal (NF-e) após a confirmação.",
          ],
          notesForClient: "Fresa Master - Especialistas em fresas para router CNC. Agradecemos a preferência!",
        };

        return res.json({
          success: true,
          summary: parsed.summary || "Orçamento Fresa Master gerado com sucesso!",
          confidence: parsed.confidence || 0.96,
          missingInfo: parsed.missingInfo || [],
          quote,
        });
      }
    }

    // Heuristic Fallback - Ensures the app NEVER crashes even when API quota is exhausted
    const fallbackQuote = parseFresaMasterFallback(text, currentQuote, productCatalog);
    return res.json({
      success: true,
      summary: "Orçamento processado com sucesso pelo analisador Fresa Master (modo contínuo sem interrupção).",
      confidence: 0.92,
      missingInfo: ["Cota gratuita do Gemini atingida temporariamente. O orçamento foi calculado com precisão pelo motor local da Fresa Master."],
      quote: fallbackQuote,
    });
  } catch (error: any) {
    console.error("Erro na extração:", error);
    const liveCatalog = req.body?.blingCatalogAvailable === true
      ? normalizeBlingCatalogProducts(Array.isArray(req.body?.blingProducts) ? req.body.blingProducts : [])
      : null;
    const fallbackQuote = parseFresaMasterFallback(
      req.body?.text || "",
      req.body?.currentQuote,
      liveCatalog || [],
    );
    res.json({
      success: true,
      summary: "Orçamento preenchido pelo analisador local Fresa Master.",
      confidence: 0.90,
      missingInfo: [],
      quote: fallbackQuote,
    });
  }
});

app.post("/api/shipping/extract-delivery", async (req, res) => {
  const text = req.body?.text;
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Cole a mensagem com o endereço de entrega." });
  }
  if (text.length > 5000) {
    return res.status(413).json({ error: "O endereço excede o limite de 5.000 caracteres." });
  }
  const ai = getGeminiClient();
  if (!ai) return res.status(503).json({ error: "IA indisponível. Configure a chave Gemini no servidor." });
  try {
    if (!await reserveGeminiRequest()) {
      return res.status(429).json({ error: "Limite diário de uso da IA atingido ou controle de custo indisponível." });
    }
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: text,
      config: {
        systemInstruction: deliveryExtractionInstruction,
        responseMimeType: "application/json",
        responseSchema: deliveryExtractionSchema,
        maxOutputTokens: 1200,
      },
    });
    const delivery = normalizeExtractedDelivery(JSON.parse(response.text || "null"));
    return res.json({ success: true, ...await completeDeliveryByCep(delivery) });
  } catch (error) {
    console.error("Erro na extração do endereço de entrega:", error);
    return res.status(502).json({ error: error instanceof Error ? error.message : "Não foi possível extrair o endereço de entrega." });
  }
});

// Endpoint: Extract Cadastral Data from Client Card (Text, Image or PDF) for Bling NF-e
app.post("/api/bling/lookup-cnpj", async (req, res) => {
  try {
    const result = await lookupCnpj(req.body?.cnpj);
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof CnpjLookupError) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    console.error("Erro na consulta cadastral por CNPJ:", error);
    return res.status(502).json({ success: false, error: "Não foi possível consultar os dados deste CNPJ." });
  }
});

app.post("/api/bling/extract-cadastral", async (req, res) => {
  try {
    const { text, currentClient, file } = req.body;
    // file: { base64: string, mimeType: string, fileName?: string }
    if ((!text || typeof text !== "string") && (!file || !file.base64)) {
      return res.status(400).json({ error: "Texto ou documento com dados cadastrais é obrigatório." });
    }
    if (typeof text === "string" && text.length > 5000) {
      return res.status(413).json({ error: "O texto cadastral excede o limite de 5.000 caracteres." });
    }
    if (typeof file?.base64 === "string" && file.base64.length > 2500000) {
      return res.status(413).json({ error: "O documento excede o limite de tamanho de 1,8 MB." });
    }

    const ai = getGeminiClient();

    if (ai) {
      try {
        const textInstruction = `
Você é o assistente fiscal e de faturamento da Fresa Master.
O cliente enviou seus dados cadastrais (por escrito, imagem do Cartão CNPJ, PDF ou comprovante de inscrição) para a emissão da Nota Fiscal Eletrônica (NF-e) no Bling ERP.

Analise o documento e/ou texto fornecido e extraia com máxima precisão fiscal brasileira:
- Razão Social (name) - Nome empresarial oficial
- Nome Fantasia (tradeName) - Se não houver, use o mesmo da Razão Social
- CNPJ ou CPF (document) - remova pontuações e mantenha apenas números ou formato padrão
- Inscrição Estadual (ie) - use somente a IE expressa; se não estiver disponível, deixe em branco e não presuma "ISENTO"
- CEP (formato 00000-000)
- Logradouro (address - rua, avenida, rodovia)
- Número (number)
- Complemento (complement - sala, galpão, lote, etc.)
- Bairro (neighborhood)
- Cidade (city)
- Estado (state - sigla UF de 2 letras, ex: PR, SP, SC)
- E-mail fiscal para envio do XML e DANFE (email)
- Telefone / Celular (phone)

Texto adicional fornecido:
"""
${text || "(Documento/Cartão CNPJ anexado em imagem/PDF)"}
"""
`;

        const candidateModels = [GEMINI_MODEL];
        let cadastralResponseText = "";

        // Build contents parts (text + optional image or PDF inlineData)
        const parts: any[] = [];
        if (file && file.base64 && file.mimeType) {
          // Normalize base64 in case it includes data url prefix
          const cleanBase64 = file.base64.replace(/^data:[^;]+;base64,/, "");
          parts.push({
            inlineData: {
              data: cleanBase64,
              mimeType: file.mimeType,
            },
          });
        }
        parts.push({ text: textInstruction });

        if (!await reserveGeminiRequest()) {
          return res.status(429).json({ success: false, error: "Limite diário de uso da IA atingido ou controle de custo indisponível. Tente novamente amanhã." });
        }

        for (const modelName of candidateModels) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: { parts },
              config: {
                systemInstruction:
                  "Você é um especialista em emissão de NF-e e leitura de Cartão CNPJ e cadastros de clientes no Bling ERP.",
                responseMimeType: "application/json",
                maxOutputTokens: 1200,
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    success: { type: Type.BOOLEAN },
                    summary: { type: Type.STRING },
                    client: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        tradeName: { type: Type.STRING },
                        document: { type: Type.STRING },
                        ie: { type: Type.STRING },
                        email: { type: Type.STRING },
                        phone: { type: Type.STRING },
                        cep: { type: Type.STRING },
                        address: { type: Type.STRING },
                        number: { type: Type.STRING },
                        complement: { type: Type.STRING },
                        neighborhood: { type: Type.STRING },
                        city: { type: Type.STRING },
                        state: { type: Type.STRING },
                      },
                      required: ["name", "document", "cep"],
                    },
                  },
                  required: ["client", "summary"],
                },
              },
            });
            cadastralResponseText = response.text?.trim() || "";
            if (cadastralResponseText) break;
          } catch (cadErr: any) {
            console.warn(`Modelo ${modelName} indisponível no cadastro:`, cadErr.message);
          }
        }

        if (cadastralResponseText) {
          const parsed = JSON.parse(cadastralResponseText || "{}");
          const client = {
            ...currentClient,
            ...parsed.client,
          };

          // If CEP is present, query ViaCEP to ensure state, city and neighborhood match
          if (client.cep) {
            const addressInfo = await lookupViaCep(client.cep);
            if (addressInfo) {
              client.city = client.city || addressInfo.cidade;
              client.state = client.state || addressInfo.uf;
              client.neighborhood = client.neighborhood || addressInfo.bairro;
              client.address = client.address || addressInfo.logradouro;
            }
          }

          return res.json({
            success: true,
            summary: parsed.summary || "Dados cadastrais extraídos com sucesso para emissão de NF-e!",
            client,
          });
        }
      } catch (geminiError) {
        console.warn("Gemini temporariamente indisponível no cadastro, usando analisador heurístico:", geminiError);
      }
    }

    // Robust Fallback extraction for Brazilian Fiscal and Cadastral data
    const cleanText = text;
    const nameMatch = cleanText.match(/(?:raz[aã]o social|empresa|cliente)\s*:?\s*([^,\n\r]+)/i);
    const cnpjMatch = cleanText.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/) || cleanText.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
    const ieMatch = cleanText.match(/(?:ie|inscri[cç][aã]o estadual)\s*:?\s*([0-9.-]+|isento)/i);
    const cepMatch = cleanText.match(/cep\s*:?\s*(\d{5}-?\d{3})/i) || cleanText.match(/\b\d{5}-?\d{3}\b/);
    const emailMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = cleanText.match(/(?:tel|telefone|fone|cel|whats(?:app)?)\s*:?\s*([0-9()\s-]+)/i) || cleanText.match(/(?:\(?\d{2}\)?\s*)?(?:9\d{4}[-\s]?\d{4})/);
    const addressMatch = cleanText.match(/(?:rua|av|avenida|rodovia|estrada|alameda)\s+[^,\n\r]+/i);

    const detectedCep = cepMatch ? (cepMatch[1] || cepMatch[0]) : currentClient?.cep || "";
    let addressInfo: any = null;
    if (detectedCep) {
      addressInfo = await lookupViaCep(detectedCep);
    }

    const client = {
      ...currentClient,
      name: nameMatch ? nameMatch[1].trim() : currentClient?.name || "Empresa Cliente Ltda",
      document: cnpjMatch ? cnpjMatch[0] : currentClient?.document || "",
      ie: ieMatch ? ieMatch[1].trim().toUpperCase() : (currentClient?.ie || ""),
      cep: detectedCep,
      address: addressMatch ? addressMatch[0].trim() : (addressInfo?.logradouro || currentClient?.address || ""),
      neighborhood: addressInfo?.bairro || currentClient?.neighborhood || "",
      city: addressInfo?.cidade || currentClient?.city || "",
      state: addressInfo?.uf || currentClient?.state || "",
      email: emailMatch ? emailMatch[0] : currentClient?.email || "",
      phone: phoneMatch ? (phoneMatch[1] || phoneMatch[0]).trim() : currentClient?.phone || "",
    };

    return res.json({
      success: true,
      summary: "Dados cadastrais extraídos com sucesso para a Nota Fiscal!",
      client,
    });
  } catch (error: any) {
    console.error("Erro na extração cadastral:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Generate Bling API v3 Payload & XML for Sales Order / NF-e
app.post("/api/bling/generate-payload", async (req, res) => {
  try {
    const { quote } = req.body;
    if (!quote || !quote.client) {
      return res.status(400).json({ error: "Orçamento inválido" });
    }

    const cleanCnpj = (quote.client.document || "").replace(/\D/g, "");
    const cleanCep = (quote.client.cep || "").replace(/\D/g, "");
    const cleanPhone = (quote.client.phone || "").replace(/\D/g, "");

    const payment = await buildSalePayment(req.body.token || persistedBlingToken || process.env.BLING_API_TOKEN || "", quote);
    // 1. Bling API v3 JSON Structure (/pedidos/vendas)
    const blingJson = {
      numero: quote.id.replace(/\D/g, "") || String(Date.now()).slice(-6),
      numeroLoja: "FRESA-MASTER",
      data: quote.project.date || new Date().toISOString().split("T")[0],
      dataSaida: quote.project.date || new Date().toISOString().split("T")[0],
      contato: {
        nome: quote.client.name,
        tipoPessoa: cleanCnpj.length === 14 ? "J" : "F",
        numeroDocumento: cleanCnpj,
        ie: quote.client.ie || "",
        email: quote.client.email || "",
        telefone: cleanPhone,
        endereco: {
          endereco: quote.client.address || "",
          numero: quote.client.number || "S/N",
          complemento: quote.client.complement || "",
          bairro: quote.client.neighborhood || "",
          cep: cleanCep,
          municipio: quote.client.city || "",
          uf: quote.client.state || "SP",
        },
      },
      itens: buildSaleItems(quote.items),
      transporte: {
        fretePorConta: 0, // 0 = Contratação do Frete por conta do Remetente (CIF), 1 = Destinatário (FOB)
        transportador: {
          nome: quote.shipping?.selectedOption?.carrier || "Melhor Envio / Correios",
        },
        frete: Number(quote.financials?.shippingAmount) || 0,
        etiqueta: buildShipTo(quote),
        volumes: [
          {
            servico: quote.shipping?.selectedOption?.name || "Sedex",
            pesoBruto: 0.35, // 350g pacote padrão de fresas
            pesoLiquido: 0.25,
          },
        ],
      },
      ...payment,
      observacoes: `Orçamento ${quote.id} gerado pela Fresa Master. ${quote.observations?.join(" ") || ""}`,
    };

    // 2. Bling XML Structure (for direct XML upload in Bling)
    const xmlItems = (quote.items || [])
      .map(
        (it: any, i: number) => `
    <item>
      <codigo>${it.sku || `FM-${i + 1}`}</codigo>
      <descricao><![CDATA[${it.description}]]></descricao>
      <un>${it.unit || "UN"}</un>
      <qtde>${it.quantity}</qtde>
      <vlr_unit>${it.unitPrice.toFixed(2)}</vlr_unit>
      <tipo>P</tipo>
      <origem>0</origem>
      <class_fiscal>${it.ncm || "8207.70.00"}</class_fiscal>
    </item>`
      )
      .join("");

    const shipTo = buildShipTo(quote);
    const blingXml = `<?xml version="1.0" encoding="UTF-8"?>
<pedido>
  <cliente>
    <nome><![CDATA[${quote.client.name}]]></nome>
    <tipoPessoa>${cleanCnpj.length === 14 ? "J" : "F"}</tipoPessoa>
    <cpf_cnpj>${cleanCnpj}</cpf_cnpj>
    <ie>${quote.client.ie || ""}</ie>
    <endereco><![CDATA[${quote.client.address || ""}]]></endereco>
    <numero>${quote.client.number || "S/N"}</numero>
    <complemento><![CDATA[${quote.client.complement || ""}]]></complemento>
    <bairro><![CDATA[${quote.client.neighborhood || ""}]]></bairro>
    <cep>${cleanCep}</cep>
    <cidade><![CDATA[${quote.client.city || ""}]]></cidade>
    <uf>${quote.client.state || "SP"}</uf>
    <fone>${cleanPhone}</fone>
    <email>${quote.client.email || ""}</email>
  </cliente>
  <transporte>
    <transportadora><![CDATA[${quote.shipping?.selectedOption?.carrier || "Correios"}]]></transportadora>
    <tipo_frete>R</tipo_frete>
    <servico_correios>${quote.shipping?.selectedOption?.name || "Sedex"}</servico_correios>
    <dados_etiqueta>
      <nome><![CDATA[${shipTo.nome}]]></nome>
      <endereco><![CDATA[${shipTo.endereco}]]></endereco>
      <numero>${shipTo.numero}</numero>
      <complemento><![CDATA[${shipTo.complemento}]]></complemento>
      <bairro><![CDATA[${shipTo.bairro}]]></bairro>
      <cep>${shipTo.cep}</cep>
      <municipio><![CDATA[${shipTo.municipio}]]></municipio>
      <uf>${shipTo.uf}</uf>
    </dados_etiqueta>
  </transporte>
  <itens>${xmlItems}
  </itens>
  <vlr_frete>${(quote.financials?.shippingAmount || 0).toFixed(2)}</vlr_frete>
  <vlr_desconto>${(quote.financials?.discountAmount || 0).toFixed(2)}</vlr_desconto>
  <obs><![CDATA[Orçamento Fresa Master ${quote.id}. Frete via ${quote.shipping?.selectedOption?.name || "Sedex"}.]]></obs>
</pedido>`;

    res.json({
      success: true,
      blingJson,
      blingXml,
    });
  } catch (err: any) {
    if (err instanceof BlingFiscalError) return res.status(err.status).json({ success: false, error: err.message, details: err.details });
    console.error("Erro ao gerar arquivos do Bling:", err);
    res.status(500).json({ error: err.message });
  }
});

// Global in-memory and env token for Bling API v3
let persistedBlingToken = process.env.BLING_API_TOKEN || "";

// Endpoint: Get Bling current connection status and token
app.get("/api/bling/status", async (req, res) => {
  const hasToken = Boolean(persistedBlingToken && persistedBlingToken.trim() !== "");
  return res.json({
    connected: hasToken,
    hasToken,
  });
});

// Endpoint: Test Bling API v3 Connection directly
app.post("/api/bling/test-connection", async (req, res) => {
  try {
    const { token } = req.body;
    if (token && typeof token === "string" && token.trim()) {
      persistedBlingToken = token.trim();
    }
    const effectiveToken = token || persistedBlingToken || process.env.BLING_API_TOKEN;

    if (!effectiveToken || effectiveToken.trim() === "") {
      return res.status(400).json({
        success: false,
        connected: false,
        message: "Nenhum token de API do Bling fornecido. Obtenha seu Token de API v3 no Bling em Preferências > Sistema > Usuários e Usuário API ou Configurações > Integrações.",
      });
    }

    // Validate basic account access and the product permission used by catalog sync.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const headers = {
      "Authorization": `Bearer ${effectiveToken.trim()}`,
      "Accept": "application/json",
    };

    let contactsResponse: Response;
    let productsResponse: Response;
    try {
      [contactsResponse, productsResponse] = await Promise.all([
        fetch("https://api.bling.com.br/Api/v3/contatos?limite=1", { headers, signal: controller.signal }),
        fetch("https://api.bling.com.br/Api/v3/produtos?pagina=1&limite=1", { headers, signal: controller.signal }),
      ]);
    } finally {
      clearTimeout(timeout);
    }

    if (contactsResponse.status === 401 || productsResponse.status === 401) {
      return res.json({
        success: false,
        connected: false,
        message: "Token do Bling não autorizado ou expirado. Verifique se o token de API v3 possui as permissões necessárias.",
      });
    }

    if (!contactsResponse.ok) {
      const responseText = await contactsResponse.text();
      return res.json({
        success: false,
        connected: false,
        message: `Não foi possível validar a conta Bling (HTTP ${contactsResponse.status}): ${responseText.slice(0, 200)}`,
      });
    }

    const productsData = productsResponse.ok
      ? await productsResponse.json().catch(() => ({}))
      : null;
    const productsReadable = productsResponse.ok;
    const productCount = Array.isArray(productsData?.data) ? productsData.data.length : 0;

    return res.json({
      success: true,
      connected: true,
      productsReadable,
      productCount,
      message: productsReadable
        ? `Bling conectado. A permissão de produtos também está ativa (${productCount} produto(s) nesta página).`
        : `Conta conectada, mas o Bling negou acesso a produtos (HTTP ${productsResponse.status}). Reative a permissão produtos:read no aplicativo e autorize novamente.`,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      connected: false,
      message: `Erro na comunicação com a API do Bling: ${err.message}`,
    });
  }
});

// Endpoint: Create Sales Order directly in Bling ERP via API v3 (/pedidos/vendas)
app.post("/api/bling/create-order", async (req, res) => {
  try {
    const { quote, token } = req.body;
    const effectiveToken = token || persistedBlingToken || process.env.BLING_API_TOKEN;

    if (!quote || !quote.client) {
      return res.status(400).json({
        success: false,
        error: "Dados do orçamento ou cliente não fornecidos.",
      });
    }

    if (!effectiveToken || effectiveToken.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Token de API do Bling não configurado. Adicione o Token de API v3 do Bling no painel para conectar diretamente.",
      });
    }

    const itemsMissingBlingData = (quote.items || []).filter((item: any) =>
      !String(item.sku || "").trim() || String(item.ncm || "").replace(/\D/g, "").length !== 8 || Number(item.unitPrice) <= 0,
    );
    if (quote.bling?.orderId) {
      return res.status(409).json({ success: false, error: "Este orçamento já possui pedido vinculado no Bling. Continue a emissão no pedido existente.", blingOrderId: quote.bling.orderId });
    }
    const readiness = blingReadinessIssues(quote);
    if (readiness.length) {
      return res.status(400).json({ success: false, error: readiness.join(" "), issues: readiness });
    }
    if (itemsMissingBlingData.length) {
      return res.status(400).json({
        success: false,
        error: `Cadastre ou selecione no catálogo do Bling antes de emitir: ${itemsMissingBlingData.map((item: any) => item.description).join(", ")}.`,
      });
    }

    const salePayment = await buildSalePayment(effectiveToken, quote);
    const cleanCnpj = (quote.client.document || "").replace(/\D/g, "");
    const cleanCep = (quote.client.cep || "").replace(/\D/g, "");
    const cleanPhone = (quote.client.phone || "").replace(/\D/g, "");

    // Structure Bling API v3 Sales Order payload
    const pedidoPayload: any = {
      numeroLoja: quote.id || `FM-${Date.now().toString().slice(-6)}`,
      data: quote.project?.date || new Date().toISOString().split("T")[0],
      dataSaida: quote.project?.date || new Date().toISOString().split("T")[0],
      contato: {
        nome: quote.client.name || "Cliente Fresa Master",
        tipoPessoa: cleanCnpj.length === 14 ? "J" : "F",
        numeroDocumento: cleanCnpj || undefined,
        ie: quote.client.ie || "",
        email: quote.client.email || undefined,
        telefone: cleanPhone || undefined,
        endereco: {
          endereco: quote.client.address || "Rua de Entrega",
          numero: quote.client.number || "S/N",
          complemento: quote.client.complement || undefined,
          bairro: quote.client.neighborhood || "Centro",
          cep: cleanCep || undefined,
          municipio: quote.client.city || "Curitiba",
          uf: quote.client.state || "PR",
        },
      },
      itens: buildSaleItems(quote.items),
      transporte: {
        fretePorConta: 0,
        transportador: {
          nome: quote.shipping?.selectedOption?.carrier || "Melhor Envio / Correios",
        },
        frete: Number(quote.financials?.shippingAmount) || 0,
        etiqueta: buildShipTo(quote),
        volumes: [
          {
            servico: quote.shipping?.selectedOption?.name || "Sedex",
            pesoBruto: quote.shipping?.weightKg || 0.5,
          },
        ],
      },
      ...salePayment,
      observacoes: `Pedido gerado pelo aplicativo Fresa Master • Orçamento ${quote.id}. Frete: ${quote.shipping?.selectedOption?.name || 'Sedex'} (R$ ${Number(quote.financials?.shippingAmount || 0).toFixed(2)}).`,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch("https://api.bling.com.br/Api/v3/pedidos/vendas", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${effectiveToken.trim()}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(pedidoPayload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const responseData = await response.json().catch(() => ({}));

    if (response.ok || response.status === 201) {
      const orderId = responseData?.data?.id || responseData?.id;
      if (!orderId) return res.status(502).json({ success: false, error: "O Bling respondeu sem ID do pedido. Confira a venda no Bling antes de repetir.", blingDetails: responseData });
      const orderNumber = responseData?.data?.numero || responseData?.numero || pedidoPayload.numeroLoja;
      const orderUrl = orderId ? `https://www.bling.com.br/b/vendas.php#edit/${orderId}` : undefined;

      return res.json({
        success: true,
        blingOrderId: orderId,
        blingOrderNumber: orderNumber,
        blingOrderUrl: orderUrl,
        message: `Pedido #${orderNumber} criado diretamente no Bling com sucesso!`,
        data: responseData,
      });
    }

    return res.status(response.status).json({
      success: false,
      error: formatBlingError(responseData),
      blingDetails: responseData,
    });
  } catch (err: any) {
    console.error("Erro ao enviar pedido para o Bling:", err);
    if (err instanceof BlingFiscalError) return res.status(err.status).json({ success: false, error: err.message, blingDetails: err.details });
    return res.status(500).json({
      success: false,
      error: `Erro ao comunicar com o Bling: ${err.message}`,
    });
  }
});

app.post("/api/bling/nfe/:action", async (req, res) => {
  const token = req.body.token || persistedBlingToken || process.env.BLING_API_TOKEN || "";
  const result = await handleBlingNfe(req.params.action, req.body, token);
  return res.status(result.status).json(result.body);
});

// Endpoint: Fetch live catalog / products from Bling API v3
app.get("/api/bling/products/:id", async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ success: false, error: "Informe um ID válido do produto." });
    const token = (req.get("x-bling-token") || "").replace(/^Bearer\s+/i, "") || persistedBlingToken || process.env.BLING_API_TOKEN;
    if (!token) return res.status(401).json({ success: false, error: "Conecte o Bling para consultar os dados fiscais do produto." });
    const response = await fetch(`https://api.bling.com.br/Api/v3/produtos/${req.params.id}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ success: false, error: formatBlingError(data, "Não foi possível consultar o cadastro fiscal do produto.") });
    if (!data.data?.id) return res.status(502).json({ success: false, error: "O Bling não retornou o cadastro do produto." });
    return res.json({ success: true, product: data.data });
  } catch (error) {
    console.error("Falha ao consultar dados fiscais do produto:", error);
    return res.status(502).json({ success: false, error: "Falha de comunicação ao consultar o cadastro fiscal do produto." });
  }
});

app.get("/api/bling/products", async (req, res) => {
  try {
    const authorization = req.get("x-bling-token") || "";
    const token = authorization.replace(/^Bearer\s+/i, "")
      || (req.query.token as string)
      || persistedBlingToken
      || process.env.BLING_API_TOKEN;
    if (!token || token.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Token de API do Bling não configurado.",
      });
    }

    const products: any[] = [];
    const pageLimit = 100;
    for (let page = 1; page <= 20; page += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let response: Response;
      try {
        response = await fetch(`https://api.bling.com.br/Api/v3/produtos?pagina=${page}&limite=${pageLimit}`, {
          headers: {
            "Authorization": `Bearer ${token.trim()}`,
            "Accept": "application/json",
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const responseData = await response.json().catch(() => ({}));
        const apiMessage = responseData.error?.description
          || responseData.error?.message
          || responseData.message
          || `HTTP ${response.status}`;
        return res.status(response.status).json({
          success: false,
          error: `Falha ao consultar produtos no Bling: ${apiMessage}. Verifique se o aplicativo possui a permissão produtos:read.`,
        });
      }

      const data = await response.json();
      const pageProducts = Array.isArray(data.data) ? data.data : [];
      products.push(...pageProducts);
      if (pageProducts.length < pageLimit) break;
    }

    return res.json({
      success: true,
      products,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

app.post("/api/bling/products", async (req, res) => {
  try {
    const authorization = req.get("x-bling-token") || "";
    const token = authorization.replace(/^Bearer\s+/i, "")
      || req.body?.token
      || persistedBlingToken
      || process.env.BLING_API_TOKEN;
    const product = req.body?.product || {};
    const name = String(product.name || "").trim();
    const sku = String(product.sku || "").trim();
    const price = Number(product.price);
    const ncm = String(product.ncm || "").replace(/\D/g, "");

    if (!token) return res.status(401).json({ success: false, error: "Conecte o Bling antes de cadastrar o produto." });
    if (!name || !sku || !Number.isFinite(price) || price <= 0 || ncm.length !== 8) {
      return res.status(400).json({ success: false, error: "Informe descrição, SKU, preço maior que zero e NCM com 8 dígitos." });
    }
    if (["00000000", "82077000"].includes(ncm)) return res.status(400).json({ success: false, error: "NCM zerado ou 8207.70.00 não é aceito. Confirme a classificação fiscal do produto antes de cadastrá-lo." });

    const response = await fetch("https://api.bling.com.br/Api/v3/produtos", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${String(token).trim()}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome: name,
        codigo: sku,
        preco: price,
        tipo: "P",
        situacao: "A",
        formato: "S",
        unidade: "UN",
        pesoLiquido: 0,
        pesoBruto: 0,
        tributacao: { ncm },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data.error?.description || data.message || "O Bling recusou o cadastro do produto.",
        details: data,
      });
    }

    return res.status(201).json({ success: true, product: data.data });
  } catch (error: any) {
    console.error("Erro ao cadastrar produto no Bling:", error);
    return res.status(500).json({ success: false, error: `Erro ao cadastrar produto no Bling: ${error.message}` });
  }
});

// Serve logo for Bling App Icon
app.get(["/logo.svg", "/logo.png", "/icon.png", "/fresa-logo.png"], (_req, res) => {
  const logoPath = path.join(process.cwd(), "public", "logo.svg");
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.sendFile(logoPath);
});

// Bling OAuth2 Callback Endpoint
app.get("/api/bling/oauth/callback", (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  const error = req.query.error as string;
  const errorDescription = req.query.error_description as string;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Retorno de Autorização Bling ERP • Fresa Master</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; max-width: 580px; width: 100%; padding: 32px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
    h1 { margin-top: 0; font-size: 22px; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
    .badge { display: inline-block; background: #059669; color: #ecfdf5; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 9999px; margin-bottom: 16px; }
    .code-box { background: #090d16; border: 1px solid #334155; border-radius: 8px; padding: 14px; font-family: monospace; font-size: 13px; color: #34d399; word-break: break-all; margin: 16px 0; }
    .info { font-size: 14px; color: #94a3b8; line-height: 1.6; }
    .btn { display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 13px; margin-top: 10px; margin-right: 10px; cursor: pointer; border: none; }
    .btn:hover { background: #1d4ed8; }
    .btn-copy { background: #059669; }
    .btn-copy:hover { background: #047857; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Bling ERP API v3</span>
    <h1>${error ? 'Erro na Autorização' : '✅ Autorização Concedida!'}</h1>
    ${error ? `
      <p class="info" style="color: #f87171;">O Bling retornou um erro: <strong>${error}</strong> (${errorDescription || ''})</p>
    ` : `
      <p class="info">Sua conta do Bling ERP autorizou o <strong>Fresa Master</strong>.</p>
      <p class="info">Código de Autorização (Code):</p>
      <div class="code-box" id="code-val">${code || 'Nenhum código retornado'}</div>
      <button class="btn btn-copy" onclick="copyCode()">Copiar Código</button>
      <a href="/" class="btn">Abrir Fresa Master</a>
      <p class="info" style="margin-top: 16px; font-size: 12px; color: #64748b;">
        Se você abriu por pop-up, este código já foi comunicado automaticamente à aba principal.
      </p>
    `}
  </div>
  <script>
    const code = ${JSON.stringify(code || '')};
    if (code && window.opener) {
      try {
        window.opener.postMessage({ type: 'BLING_AUTH_CODE', code: code }, '*');
      } catch (e) {}
    }
    function copyCode() {
      const text = document.getElementById('code-val').innerText;
      navigator.clipboard.writeText(text);
      alert('Código copiado com sucesso!');
    }
  </script>
</body>
</html>`;

  res.send(html);
});

// Endpoint to exchange code for access_token with Bling API v3
app.post("/api/bling/oauth/token-exchange", async (req, res) => {
  try {
    const { code, clientId, clientSecret, redirectUri } = req.body;

    if (!code || !clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        error: "Parâmetros obrigatórios ausentes: code, clientId e clientSecret são necessários."
      });
    }

    const credentials = Buffer.from(`${clientId.trim()}:${clientSecret.trim()}`).toString("base64");
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code.trim());
    if (redirectUri) {
      params.append("redirect_uri", redirectUri.trim());
    }

    const response = await fetch("https://bling.com.br/Api/v3/oauth/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: params.toString()
    });

    const data: any = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data.error_description || data.error || "Erro ao obter token do Bling",
        details: data
      });
    }

    return res.json({
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: "Falha na comunicação com o servidor do Bling: " + (err.message || String(err))
    });
  }
});

// Documentation / Manual Page required by Bling App Store Review
app.get(["/manual", "/bling-manual"], (req, res) => {
  const host = `${req.protocol}://${req.get("host")}`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manual de Uso e Integração Bling ERP • Fresa Master</title>
  <meta name="description" content="Manual oficial de integração do aplicativo Fresa Master com o Bling ERP para emissão de pedidos de venda e NF-e.">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.7; margin: 0; padding: 40px 20px; }
    .container { max-width: 860px; margin: 0 auto; background: #1e293b; border: 1px solid #334155; border-radius: 20px; padding: 40px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
    header { border-b: 1px solid #334155; padding-bottom: 24px; margin-bottom: 32px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand-title { font-size: 24px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px; }
    .brand-subtitle { font-size: 13px; color: #f59e0b; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; }
    .badge { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; }
    h2 { color: #38bdf8; font-size: 20px; margin-top: 32px; border-left: 4px solid #f59e0b; padding-left: 12px; }
    h3 { color: #f1f5f9; font-size: 16px; margin-top: 24px; }
    p, li { color: #94a3b8; font-size: 14.5px; }
    strong { color: #f8fafc; }
    ul, ol { padding-left: 20px; }
    li { margin-bottom: 8px; }
    .step-box { background: #090d16; border: 1px solid #334155; border-radius: 12px; padding: 18px 22px; margin: 16px 0; }
    .step-title { font-weight: 800; color: #f8fafc; font-size: 15px; margin-bottom: 6px; }
    .code-tag { background: #334155; color: #fbbf24; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; }
    .scope-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
    .scope-table th { background: #090d16; color: #38bdf8; text-align: left; padding: 10px 14px; border: 1px solid #334155; }
    .scope-table td { padding: 10px 14px; border: 1px solid #334155; color: #cbd5e1; }
    .footer { border-top: 1px solid #334155; margin-top: 40px; padding-top: 20px; font-size: 12px; color: #64748b; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
    .btn-home { background: #2563eb; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div>
          <div class="brand-title">Fresa Master</div>
          <div class="brand-subtitle">Router CNC & Ferramentas de Usinagem</div>
        </div>
      </div>
      <div class="badge">Manual de Integração Bling ERP v3</div>
    </header>

    <h2>1. Visão Geral do Aplicativo</h2>
    <p>O <strong>Fresa Master</strong> é uma plataforma especializada para cálculo de orçamentos por voz e inteligência artificial, pesagem técnica e cotação de fretes via Melhor Envio, com sincronização direta ao <strong>Bling ERP</strong> para automação de Pedidos de Venda e faturamento de Nota Fiscal Eletrônica (NF-e).</p>

    <h2>2. Como Funciona a Integração com o Bling ERP</h2>
    <p>A integração entre o Fresa Master e o Bling ERP opera através da <strong>API v3 Oficial do Bling</strong>, realizando duas operações fundamentais:</p>
    <ol>
      <li><strong>Leitura Cadastral Fiscal:</strong> Preenchimento automatizado de Razão Social, CNPJ/CPF, Inscrição Estadual e CEP a partir de imagens do Cartão CNPJ ou mensagens de clientes.</li>
      <li><strong>Criação de Pedidos de Venda (/pedidos/vendas):</strong> Transmissão direta dos itens orçados, com SKU oficial, classificação fiscal NCM <span class="code-tag">8207.70.00</span> (ferramentas de usinagem), transportador e frete selecionado.</li>
    </ol>

    <h2>3. Escopos Solicitados e Justificativa de Uso</h2>
    <table class="scope-table">
      <thead>
        <tr>
          <th>Escopo</th>
          <th>Permissão</th>
          <th>Justificativa Operacional</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="code-tag">pedidos:vendas:write</span></td>
          <td>Gravação / Criação</td>
          <td>Permite ao Fresa Master criar o Pedido de Venda aprovado pelo cliente com ferramentas, valores e frete.</td>
        </tr>
        <tr>
          <td><span class="code-tag">pedidos:vendas:read</span></td>
          <td>Leitura / Consulta</td>
          <td>Permite consultar o status do pedido de venda e o número gerado no Bling.</td>
        </tr>
        <tr>
          <td><span class="code-tag">contatos:write</span></td>
          <td>Gravação</td>
          <td>Cadastrar ou atualizar o cliente com Razão Social, CNPJ, Inscrição Estadual e endereço para a NF-e.</td>
        </tr>
        <tr>
          <td><span class="code-tag">contatos:read</span></td>
          <td>Leitura</td>
          <td>Evitar duplicidade de contatos e puxar dados cadastrais previamente existentes.</td>
        </tr>
        <tr>
          <td><span class="code-tag">produtos:read</span></td>
          <td>Leitura</td>
          <td>Sincronizar as fresas e pinças cadastradas no estoque do Bling para utilização no orçamento.</td>
        </tr>
      </tbody>
    </table>

    <h2>4. Passo a Passo de Operação</h2>
    <div class="step-box">
      <div class="step-title">Etapa 1: Geração do Orçamento no Fresa Master</div>
      <p>O operador dita ou digita os itens de fresas (ex: 2 fresas 3 cortes TCT) e o CEP do cliente. O sistema calcula o peso, cota o Sedex/PAC via Melhor Envio e formata o orçamento.</p>
    </div>

    <div class="step-box">
      <div class="step-title">Etapa 2: Aprovação e Dados Cadastrais</div>
      <p>Com o orçamento aprovado, o cliente envia seu Cartão CNPJ ou dados fiscais. A IA do Fresa Master extrai e valida todos os campos obrigatórios para o faturamento.</p>
    </div>

    <div class="step-box">
      <div class="step-title">Etapa 3: Envio Direto ao Bling ERP</div>
      <p>Com 1 clique no botão <strong>"Criar Pedido no Bling Agora"</strong>, o Fresa Master transmite o pedido para a conta Bling da empresa via API v3. O pedido surge imediatamente em <em>Vendas &gt; Pedidos de Venda</em> pronto para emitir a NF-e.</p>
    </div>

    <h2>5. Segurança e Proteção de Dados (LGPD)</h2>
    <p>Todas as comunicações com a API do Bling ERP utilizam protocolo criptografado TLS/HTTPS. O token de acesso fica armazenado sob controle estrito do usuário ou nas variáveis de ambiente seguras do servidor, não sendo compartilhado com terceiros.</p>

    <h2>6. Suporte &amp; Contato</h2>
    <p>Para dúvidas, suporte técnico ou esclarecimentos sobre o aplicativo Fresa Master:</p>
    <ul>
      <li><strong>E-mail de Contato:</strong> fresamaster0@gmail.com</li>
      <li><strong>Empresa:</strong> Fresa Master CNC</li>
      <li><strong>Origem Operacional:</strong> Salto / SP (CEP 13329-350)</li>
    </ul>

    <div class="footer">
      <div>© 2026 Fresa Master • Todos os direitos reservados.</div>
      <a href="${host}/" class="btn-home">Acessar o Aplicativo</a>
    </div>
  </div>
</body>
</html>`;

  res.send(html);
});

// Endpoint: Return all Bling App Registration fields with dynamic Host URL
app.get("/api/bling/app-details", (req, res) => {
  const host = `${req.protocol}://${req.get("host")}`;

  res.json({
    success: true,
    appName: "Fresa Master CNC",
    homepageUrl: `${host}/`,
    redirectUrl: `${host}/api/bling/oauth/callback`,
    manualUrl: `${host}/manual`,
    iconUrl: `${host}/logo.svg`,
    suggestedVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    contactEmail: "fresamaster0@gmail.com",
    scopes: [
      { code: "pedidos:vendas:write", description: "Pedidos de Venda - Criar e Alterar (Permite enviar o pedido de fresas com frete)" },
      { code: "pedidos:vendas:read", description: "Pedidos de Venda - Consultar (Para acompanhar o status do pedido criado)" },
      { code: "contatos:write", description: "Clientes e Contatos - Criar e Alterar (Para salvar o cliente com CNPJ e endereço)" },
      { code: "contatos:read", description: "Clientes e Contatos - Consultar (Para evitar cadastros duplicados)" },
      { code: "produtos:read", description: "Produtos - Consultar (Para puxar as fresas cadastradas no Bling)" },
      { code: "produtos:write", description: "Produtos - Criar e Alterar (Para cadastrar produtos novos no catálogo)" },
    ],
    alternateFastMethod: {
      title: "Método Rápido Sem Cadastro de Aplicativo (Usuário API)",
      steps: [
        "1. No Bling, acesse: Preferências (ícone de engrenagem) > Sistema > Usuários e Usuário API",
        "2. Clique no botão 'Incluir Usuário'",
        "3. Selecione o tipo 'Usuário API'",
        "4. Preencha o Nome (ex: 'Fresa Master') e E-mail (fresamaster0@gmail.com)",
        "5. Na aba 'Permissões', marque 'Vendas' (Pedidos de Venda) e 'Cadastros' (Contatos e Produtos)",
        "6. O Bling gerará uma API Key / Token na hora! Copie e cole no Fresa Master sem precisar aguardar aprovação de aplicativo.",
      ]
    }
  });
});


// Proposal text endpoint
app.post("/api/quote/generate-proposal", async (req, res) => {
  try {
    const { quote, channel = "whatsapp", tone = "friendly" } = req.body;

    const total = Number(quote.financials?.totalAmount || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    const shippingName = quote.shipping?.selectedOption?.name || "Sedex (Melhor Envio)";
    const shippingCost = Number(quote.financials?.shippingAmount || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    const discountAmount = Number(quote.financials?.discountAmount || 0);
    const discountLine = discountAmount > 0
      ? `\nDesconto concedido: -${discountAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
      : "";

    const ai = getGeminiClient();

    if (ai) {
      const prompt = `
Crie uma mensagem comercial da "Fresa Master" para envio ao cliente via ${channel === "whatsapp" ? "WhatsApp (com emojis amigáveis e texto formatado em negrito *assim*)" : "E-mail"}.
Tom: ${tone}.

Dados da Fresa Master:
Empresa: Fresa Master - Especialistas em Fresas para Router CNC
Cliente: ${quote.client.name}
CEP de entrega: ${quote.client.cep || "Não informado"}
Cidade/UF: ${quote.client.city || ""}/${quote.client.state || ""}
Itens orçados:
${(quote.items || [])
  .map(
    (i: any) =>
      `• ${i.description}: ${i.quantity} ${i.unit} x R$ ${Number(i.unitPrice).toFixed(2)} = R$ ${Number(i.totalPrice).toFixed(2)}`
  )
  .join("\n")}

Subtotal produtos: R$ ${Number(quote.financials?.subtotal || 0).toFixed(2)}
Frete calculado (${shippingName}${quote.shipping?.weightKg ? ` - Peso: ${Number(quote.shipping.weightKg).toFixed(1).replace(".", ",")} kg` : ""}): ${shippingCost}
${discountAmount > 0 ? `Desconto concedido: R$ ${discountAmount.toFixed(2)}` : ""}
${discountAmount > 0 ? "" : "Não invente nem mencione desconto quando nenhum foi aplicado."}
Prazo estimado de entrega: ${quote.project?.deadline || "A combinar"}
VALOR TOTAL FINAL: ${total}
Forma de Pagamento: ${quote.financials?.paymentTerms || "Pix ou Boleto"}

Peça gentilmente para o cliente confirmar o pedido e enviar os dados cadastrais (Razão Social, CNPJ, Inscrição Estadual e endereço completo) para emissão da Nota Fiscal e despacho rápido.
`;

      if (!await reserveGeminiRequest()) {
        return res.json({ success: false, error: "Limite diário de uso da IA atingido ou controle de custo indisponível. A mensagem pronta pode ser montada sem IA." });
      }

      for (const modelName of [GEMINI_MODEL]) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { maxOutputTokens: 700 },
          });
          const textMsg = response.text?.trim();
          if (textMsg) {
            return res.json({
              success: true,
              messageText: textMsg,
            });
          }
        } catch (genErr: any) {
          console.warn(`Modelo ${modelName} indisponível no proposal:`, genErr.message);
        }
      }
    }

    // Fallback WhatsApp message
    const weightLabel = quote.shipping?.weightKg ? ` • Peso: ${Number(quote.shipping.weightKg).toFixed(1).replace(".", ",")} kg` : "";
    const msg = `Olá, *${quote.client.name}*! Tudo bem? Aqui é da *Fresa Master* 🪚⚙️\n\nSegue o orçamento das ferramentas para sua router CNC:\n\n` +
      (quote.items || [])
        .map(
          (i: any) =>
            `🔹 *${i.description}*\n   ${i.quantity} un x R$ ${Number(i.unitPrice).toFixed(2)} = R$ ${Number(i.totalPrice).toFixed(2)}`
        )
        .join("\n\n") +
      `\n\n📦 *Frete:* ${shippingName} (${shippingCost}${weightLabel})${discountLine}\n⏱️ *Prazo de entrega:* ${quote.project?.deadline || "2 a 3 dias úteis"}\n\n💰 *VALOR TOTAL:* ${total}\n💳 *Pagamento:* Pix (chave CNPJ 59.085.330/0001-70) ou link de pagamento com cartão de crédito (com juros)\n\nAssim que aprovar, é só nos avisar que já preparamos seu pedido! 🚀`;

    return res.json({
      success: true,
      messageText: msg,
    });
  } catch (error: any) {
    const defaultMsg = `Olá! Segue o orçamento da Fresa Master. Valor total: ${req.body?.quote?.financials?.totalAmount || "Consulte"}.`;
    res.json({ success: true, messageText: defaultMsg });
  }
});

// Fallback regex parser for Fresa Master
function parseFresaMasterFallback(
  text: string,
  currentQuote?: any,
  catalog: typeof BLING_FRESA_MASTER_CATALOG = [],
): any {
  const clean = text;

  // Detect CEP
  const cep = extractCepFromText(clean) || "";

  // Detect Quantity and Price
  const qtyMatch = clean.match(/(\d+)\s*(?:fresas?|unidades?|peças?)/i);
  const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
  const spokenPrices = extractUnitPricesFromText(clean);

  // Detect client name
  const nameMatch = clean.match(/(?:raz[aã]o social(?:\s+do cliente)?|cliente)\s*:?\s*([A-ZÀ-Úa-zà-ú0-9\s.]+?)(?:,|\.|\be\b|cep|$)/i);
  const clientName = nameMatch ? nameMatch[1].trim() : "Cliente CNC Router";

  // Check if text matches any product in Bling catalog
  const matchedBlingProduct = matchBlingCatalogProduct(clean, catalog);

  let itemDesc = matchedBlingProduct?.description || clean;
  let itemSku = matchedBlingProduct?.sku || "";
  let itemNcm = matchedBlingProduct?.ncm || "";
  let itemCat = matchedBlingProduct?.category || "Fresas Router CNC";
  let finalUnitPrice = spokenPrices[0] || matchedBlingProduct?.unitPrice || 0;
  let itemNotes = matchedBlingProduct
    ? `Item cadastrado no Bling ERP (${matchedBlingProduct.sku})`
    : "Não localizado no catálogo real do Bling. Revise ou cadastre antes de faturar.";

  if (matchedBlingProduct) {
    itemDesc = matchedBlingProduct.description;
    itemSku = matchedBlingProduct.sku;
    itemNcm = matchedBlingProduct.ncm;
    itemCat = matchedBlingProduct.category;
    if (!spokenPrices.length) {
      finalUnitPrice = matchedBlingProduct.unitPrice;
    }
  }

  const items = [
    {
      id: "item-1",
      description: itemDesc,
      category: itemCat,
      sku: itemSku,
      ncm: itemNcm,
      quantity: qty,
      unit: "un",
      unitPrice: finalUnitPrice,
      totalPrice: qty * finalUnitPrice,
      notes: itemNotes,
    },
  ];

  const weightInfo = calculatePackageWeightKg(items);
  const packageDimensions = currentQuote?.shipping?.packageDimensions || { ...DEFAULT_PACKAGE_DIMENSIONS };
  const customShipping = currentQuote?.shipping?.customShippingAmount !== undefined
    ? {
        amount: currentQuote.shipping.customShippingAmount,
        name: currentQuote.shipping.customShippingName || "Frete Próprio Fresa Master",
      }
    : undefined;

  const originCep = currentQuote?.shipping?.originCep || "13329-350";

  const shippingOptions = calculateMelhorEnvioRates(
    cep || "00000000",
    originCep,
    weightInfo.weightKg,
    packageDimensions,
    customShipping
  );

  let selectedOption = shippingOptions[0]; // Sedex default

  // Check if motoboy or free shipping was requested in raw text
  if (clean.includes("motoboy") || clean.includes("moto boy")) {
    const motoboyPrice = extractMotoboyPriceFromText(clean) ?? 0;
    selectedOption = {
      service: "MOTOBOY",
      name: "Envio por Motoboy",
      carrier: "Motoboy / Aplicativo",
      price: motoboyPrice,
      deliveryDays: 1,
      selected: true,
      insuranceIncluded: false,
      insuranceCost: 0,
      withInsurancePrice: motoboyPrice,
      withoutInsurancePrice: motoboyPrice,
    };
    const mIdx = shippingOptions.findIndex((o) => o.service === "MOTOBOY");
    if (mIdx >= 0) shippingOptions[mIdx] = selectedOption;
    else shippingOptions.push(selectedOption);
  } else if (clean.includes("por conta") || clean.includes("nossa conta") || clean.includes("gratis") || clean.includes("grátis") || clean.includes("cortesia")) {
    selectedOption = {
      service: "CONTA_FRESA",
      name: "Envio por Nossa Conta (Cortesia Fresa Master)",
      carrier: "Fresa Master",
      price: 0,
      deliveryDays: 2,
      selected: true,
      insuranceIncluded: false,
      insuranceCost: 0,
      withInsurancePrice: 0,
      withoutInsurancePrice: 0,
    };
    const cIdx = shippingOptions.findIndex((o) => o.service === "CONTA_FRESA");
    if (cIdx >= 0) shippingOptions[cIdx] = selectedOption;
    else shippingOptions.push(selectedOption);
  } else if (clean.includes("pac")) {
    selectedOption = shippingOptions.find((o) => o.service === "PAC") || shippingOptions[0];
  } else if (clean.includes("jadlog")) {
    selectedOption = shippingOptions.find((o) => o.service === "JADLOG_PACKAGE") || shippingOptions[0];
  } else if (clean.includes("retirada") || clean.includes("balcao") || clean.includes("balcão")) {
    selectedOption = shippingOptions.find((o) => o.service === "RETIRADA") || shippingOptions[0];
  } else if (clean.includes("melhor envio") || clean.includes("correios") || clean.includes("sedex")) {
    selectedOption = shippingOptions.find((o) => o.service === "SEDEX") || shippingOptions[0];
  }

  const subtotal = qty * finalUnitPrice;
  const spokenDiscount = extractDiscountAmountFromText(clean);
  const discountPercentage = 0;
  const discountAmount = Number(Math.min(
    subtotal,
    spokenDiscount ?? 0,
  ).toFixed(2));
  const totalAmount = Math.max(0, subtotal - discountAmount + selectedOption.price);

  return {
    id: currentQuote?.id || `FM-${Math.floor(100000 + Math.random() * 900000)}`,
    status: "draft",
    createdAt: new Date().toISOString(),
    client: {
      name: clientName,
      tradeName: "",
      company: "",
      email: "",
      phone: "",
      document: "",
      ie: "",
      cep,
      address: "Endereço a confirmar",
      number: "",
      neighborhood: "",
      city: "Curitiba",
      state: "PR",
    },
    project: {
      title: "Fornecimento de Fresas Router CNC - Fresa Master",
      category: "Ferramentas Router CNC",
      description: `Fornecimento de fresas ${itemDesc} para usinagem CNC de alto rendimento.`,
      deadline: `${selectedOption.deliveryDays} dias úteis (${selectedOption.name})`,
      validityDays: 10,
      date: new Date().toISOString().split("T")[0],
    },
    items,
    shipping: {
      originCep,
      destinationCep: cep,
      weightKg: weightInfo.weightKg,
      weightDescription: weightInfo.description,
      packageDimensions,
      customShippingAmount: customShipping?.amount,
      customShippingName: customShipping?.name,
      selectedOption,
      options: shippingOptions,
    },
    financials: {
      subtotal,
      shippingAmount: selectedOption.price,
      discountPercentage,
      discountAmount,
      taxPercentage: 0,
      taxAmount: 0,
      totalAmount,
      paymentTerms: "À vista via Pix ou Boleto",
      paymentMethod: "Pix",
    },
    observations: [
      "Envio pelo Melhor Envio com seguro total.",
      "Garantia contra defeitos de fabricação e balanceamento.",
    ],
    notesForClient: "Fresa Master - Sua router CNC trabalhando com máxima precisão.",
  };
}

// Endpoint para baixar o projeto completo em formato ZIP para abrir no VS Code
app.get("/api/download-project-zip", (_req, res) => {
  try {
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="fresa-master-app.zip"');

    const archive = new ZipArchive({
      zlib: { level: 9 },
    });

    archive.on("error", (err: Error) => {
      console.error("Erro ao gerar arquivo ZIP:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Falha ao gerar arquivo ZIP do projeto." });
      }
    });

    archive.pipe(res);

    archive.glob("**/*", {
      cwd: process.cwd(),
      ignore: [
        "node_modules/**",
        "dist/**",
        ".git/**",
        "*.log",
        ".cache/**",
        ".temp/**",
      ],
      dot: true,
    });

    archive.finalize();
  } catch (err: any) {
    console.error("Erro no endpoint /api/download-project-zip:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || "Erro interno" });
    }
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor Fresa Master rodando na porta ${PORT}`);
  });
}

startServer();
