// server.ts
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import admin from "firebase-admin";

// server/src/services/messengerService.ts
async function enviarNotificacionCliente(numero, mensaje, apiKey, deviceId) {
  const API_KEY = apiKey && apiKey.trim() !== "" ? apiKey : "bee572a4-4b0a-4f32-a959-a3832c372c62";
  const DEVICE_ID = deviceId && deviceId.trim() !== "" ? deviceId : "69c9c9495763e875d56bf0f5";
  const BASE_URL = `https://api.textbee.dev/api/v1/gateway/devices/${DEVICE_ID}/send-sms`;
  try {
    console.log(`Iniciando env\xEDo de SMS a: "${numero}"`);
    console.log(`Usando Device ID: ${DEVICE_ID.substring(0, 4)}...${DEVICE_ID.substring(DEVICE_ID.length - 4)}`);
    if (!numero) {
      throw new Error("El n\xFAmero de tel\xE9fono est\xE1 vac\xEDo.");
    }
    const numeroLimpio = numero.replace(/[^\d+]/g, "");
    console.log(`N\xFAmero sanitizado en servidor: "${numeroLimpio}"`);
    const phoneRegex = /^\+[1-9]\d{6,14}$/;
    if (!phoneRegex.test(numeroLimpio)) {
      throw new Error(`Formato de n\xFAmero inv\xE1lido: "${numeroLimpio}". Debe incluir el c\xF3digo de pa\xEDs, ej. +1829...`);
    }
    const mensajeFinal = mensaje.length > 1500 ? mensaje.substring(0, 1497) + "..." : mensaje;
    console.log("Enviando petici\xF3n a Textbee:", BASE_URL);
    if (typeof fetch === "undefined") {
      throw new Error("El entorno de ejecuci\xF3n (Node.js) no soporta 'fetch'. Se requiere Node.js v18 o superior.");
    }
    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        recipients: [numeroLimpio],
        message: mensajeFinal
      })
    });
    const responseData = await response.text();
    console.log(`Respuesta de Textbee (Status ${response.status}):`, responseData);
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Credenciales de Textbee inv\xE1lidas (401 Unauthorized). Verifique su API Key y Device ID.");
      }
      if (response.status === 429) {
        throw new Error("L\xEDmite de SMS diario alcanzado en Textbee (429 Too Many Requests).");
      }
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        throw new Error(`El servicio de env\xEDo de SMS (Textbee) est\xE1 temporalmente fuera de servicio (Error ${response.status}). Por favor, intente de nuevo m\xE1s tarde.`);
      }
      let errorMessage = `Error de Textbee (${response.status}): ${response.statusText}`;
      try {
        const parsedError = JSON.parse(responseData);
        if (parsedError.message) {
          errorMessage = parsedError.message;
        } else if (parsedError.error) {
          errorMessage = parsedError.error;
        }
      } catch (e) {
        if (responseData && responseData.includes("<!DOCTYPE html>")) {
          errorMessage = `Error del servidor de SMS (${response.status}). El servicio podr\xEDa estar experimentando problemas.`;
        } else if (responseData && responseData.length < 200) {
          errorMessage = responseData;
        } else if (responseData) {
          errorMessage = `Error (${response.status}): ${responseData.substring(0, 150)}...`;
        }
      }
      throw new Error(errorMessage);
    }
    try {
      const data = JSON.parse(responseData);
      return { success: true, data };
    } catch (e) {
      return { success: true, rawData: responseData };
    }
  } catch (error) {
    console.error("Error detallado en enviarNotificacionCliente:", error.message || error);
    throw error;
  }
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var isProd = process.env.NODE_ENV === "production";
var rootDir = isProd ? path.join(__dirname, "..") : process.cwd();
var app = express();
async function startServer() {
  try {
    console.log("Starting server...");
    const serviceAccountPath = path.join(rootDir, "serviceAccountKey.json");
    if (fs.existsSync(serviceAccountPath)) {
      console.log("Found serviceAccountKey.json, initializing Firebase Admin...");
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      }
    } else {
      console.warn("serviceAccountKey.json not found. Firebase Admin not initialized.");
    }
    const PORT = process.env.PORT || 3e3;
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.get("/api/health", (req, res) => {
      console.log("Health check requested");
      res.json({ status: "ok", mode: isProd ? "production" : "development" });
    });
    app.post("/api/send-sms", async (req, res) => {
      console.log("POST /api/send-sms received", req.body);
      const { numero, mensaje, apiKey, deviceId } = req.body;
      if (!numero || !mensaje) {
        console.warn("Missing parameters in /api/send-sms");
        return res.status(400).json({
          success: false,
          error: "Faltan par\xE1metros. Se requiere numero y mensaje en el body."
        });
      }
      try {
        const result = await enviarNotificacionCliente(numero, mensaje, apiKey, deviceId);
        console.log("SMS sent successfully via service");
        res.json({ success: true, result });
      } catch (error) {
        console.error("Error in /api/send-sms route:", error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    app.get("/api/test-message", async (req, res) => {
      const numero = req.query.numero;
      const mensaje = req.query.mensaje;
      if (!numero || !mensaje) {
        return res.status(400).json({
          error: "Faltan par\xE1metros. Uso: /api/test-message?numero=+18291234567&mensaje=Hola"
        });
      }
      try {
        const result = await enviarNotificacionCliente(numero, mensaje);
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    app.all("/api/*", (req, res) => {
      res.status(404).json({
        success: false,
        error: `Ruta de API no encontrada: ${req.method} ${req.url}`
      });
    });
    if (!isProd) {
      console.log("Running in development mode");
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } else {
      console.log("Running in production mode");
      const distPath = path.join(rootDir, "dist");
      console.log(`Serving static files from: ${distPath}`);
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}
startServer();
var server_default = app;
export {
  server_default as default
};
