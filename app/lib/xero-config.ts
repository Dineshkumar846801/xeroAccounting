import { db, ensureSchema } from "./db";
import { decrypt, encrypt } from "./tokens";
const fallbackRedirect="http://localhost:3000/api/xero/callback";
export async function getXeroConfig(){
  await ensureSchema();
  const result=await db().query<{client_id:string;client_secret:string;redirect_uri:string}>("SELECT client_id,client_secret,redirect_uri FROM xero_credentials WHERE id=true");
  const row=result.rows[0];
  if(row){
    try {
      return {clientId:decrypt(row.client_id),clientSecret:decrypt(row.client_secret),redirectUri:row.redirect_uri};
    } catch {
      // In case key changed or decryption fails, check env
    }
  }
  if (process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET) {
    return {
      clientId: process.env.XERO_CLIENT_ID,
      clientSecret: process.env.XERO_CLIENT_SECRET,
      redirectUri: process.env.XERO_REDIRECT_URI || fallbackRedirect
    };
  }
  throw new Error("Configure Xero credentials in Settings first");
}
export async function saveXeroConfig(clientId:string,clientSecret:string,redirectUri:string){await ensureSchema();await db().query("INSERT INTO xero_credentials (id,client_id,client_secret,redirect_uri) VALUES (true,$1,$2,$3) ON CONFLICT (id) DO UPDATE SET client_id=EXCLUDED.client_id,client_secret=EXCLUDED.client_secret,redirect_uri=EXCLUDED.redirect_uri,updated_at=now()",[encrypt(clientId),encrypt(clientSecret),redirectUri||fallbackRedirect]);}
