import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, ensureSchema } from "./db";
const cookieName="ledgerly_session";
const hash=(value:string)=>crypto.createHash("sha256").update(value).digest("hex");
export async function passwordHash(password:string){const salt=crypto.randomBytes(16).toString("hex");const derived=await new Promise<Buffer>((resolve,reject)=>crypto.scrypt(password,salt,64,(error,key)=>error?reject(error):resolve(key as Buffer)));return `${salt}:${derived.toString("hex")}`;}
export async function validPassword(password:string,stored:string){const [salt,value]=stored.split(":");if(!salt||!value)return false;const derived=await new Promise<Buffer>((resolve,reject)=>crypto.scrypt(password,salt,64,(error,key)=>error?reject(error):resolve(key as Buffer)));return crypto.timingSafeEqual(derived,Buffer.from(value,"hex"));}
export async function hasUsers(){await ensureSchema();return (await db().query("SELECT 1 FROM app_users LIMIT 1")).rowCount!>0;}
export async function login(email:string,password:string){await ensureSchema();const result=await db().query<{id:string;password_hash:string}>("SELECT id,password_hash FROM app_users WHERE email=$1",[email.toLowerCase().trim()]);const user=result.rows[0];if(!user||!(await validPassword(password,user.password_hash)))return false;const token=crypto.randomBytes(32).toString("base64url");await db().query("INSERT INTO app_sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)",[user.id,hash(token),new Date(Date.now()+7*86400000)]);const store=await cookies();store.set(cookieName,token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:7*86400});return true;}
export async function requireAdmin(){const token=(await cookies()).get(cookieName)?.value;if(!token)redirect("/login");await ensureSchema();const result=await db().query("SELECT 1 FROM app_sessions WHERE token_hash=$1 AND expires_at>now()",[hash(token)]);if(!result.rowCount)redirect("/login");}
export async function assertApiAdmin(){const token=(await cookies()).get(cookieName)?.value;if(!token)return false;await ensureSchema();const result=await db().query("SELECT 1 FROM app_sessions WHERE token_hash=$1 AND expires_at>now()",[hash(token)]);return Boolean(result.rowCount);}
export async function logout() {
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  if (token) {
    try {
      await ensureSchema();
      await db().query("DELETE FROM app_sessions WHERE token_hash=$1", [hash(token)]);
    } catch {}
  }
  store.delete(cookieName);
  store.set(cookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}
