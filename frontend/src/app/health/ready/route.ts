import { frontendReadiness } from "@/lib/api-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() { return frontendReadiness(); }
