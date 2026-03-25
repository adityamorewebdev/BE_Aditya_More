import jwt from "jsonwebtoken";

const jwtAuth = (req, res, next) => {
  const authHeader = req.header("Authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Missing or invalid token",
    });
  }

  const token = authHeader.replace("Bearer ", "").trim();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userId: payload.userId, email: payload.email };
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

export default jwtAuth;