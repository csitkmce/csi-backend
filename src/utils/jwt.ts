import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

export const generateTokens = (payload: object) => {
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m'});
    const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d'});
    return { accessToken, refreshToken };
}

export const verifyAccessToken = (token: string) => {
    jwt.verify(token, JWT_SECRET);
}

export const verifyRefreshToken = (token: string) => {
    jwt.verify(token, JWT_REFRESH_SECRET);
}