import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

export const generateTokens = (payload: object) => {
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });
  return { accessToken, refreshToken };
};

export function verifyAccessToken(token: string): Promise<any | null> {
  return new Promise((resolve) => {
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) return resolve(null);
      resolve(decoded);
    });
  });
}

export const verifyRefreshToken = (token: string) => {
  return new Promise((resolve) => {
    jwt.verify(token, JWT_REFRESH_SECRET, (err, decoded) => {
      if (err) return resolve(null);
      resolve(decoded);
    });
  });
};
