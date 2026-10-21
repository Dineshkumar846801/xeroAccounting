import { NextResponse } from "next/server";
import { assertApiAdmin } from "@/app/lib/auth";
import { saveXeroConfig } from "@/app/lib/xero-config";
export async function POST(request:Request){if(!(await assertApiAdmin()))return NextResponse.json({error:"Sign in as an administrator first."},{status:401});const {clientId,clientSecret,redirectUri}=await request.json() as {clientId?:string;clientSecret?:string;redirectUri?:string};if(!clientId||!clientSecret)return NextResponse.json({error:"Client ID and Client Secret are required."},{status:400});try{await saveXeroConfig(clientId,clientSecret,redirectUri??"");return NextResponse.json({ok:true});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to save credentials"},{status:500});}}
