import crypto from "crypto";

const hmacAuth = (req, res, next) => {
  const appKey = req.header("X-App-Key");
  if (!appKey || appKey !== process.env.APP_KEY) {
    return res.status(403).json({
      success: false,
      message: "Invalid app key",
    });
  }

  const timestampHeader = req.header("X-Timestamp");
  const timestamp = Number(timestampHeader);
  if (!timestampHeader || Number.isNaN(timestamp)) {
    return res.status(403).json({
      success: false,
      message: "Invalid timestamp",
    });
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 60) {
    return res.status(403).json({
      success: false,
      message: "Request expired",
    });
  }

  if (!process.env.APP_HMAC_SECRET) {
    return res.status(500).json({
      success: false,
      message: "Server configuration error",
    });
  }

  const body = req.body && Object.keys(req.body).length ? req.body : {};
  const bodyHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");

  const path = req.originalUrl.split("?")[0];
  const message = `${timestamp}:${req.method.toUpperCase()}:${path}:${bodyHash}`;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.APP_HMAC_SECRET)
    .update(message)
    .digest("hex");

  const signature = req.header("X-Signature") || "";

  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return res.status(403).json({
      success: false,
      message: "Invalid signature",
    });
  }

  return next();
};

export default hmacAuth;