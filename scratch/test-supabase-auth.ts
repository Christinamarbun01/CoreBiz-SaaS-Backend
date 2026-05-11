import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const token = "eyJhbGciOiJFUzI1NiIsImtpZCI6IjgyN2ViZjQyLTQ3MzMtNDgwMC1iNTdkLTcwNWYxNmYyZjc2ZCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2Zlc3N1amR5aG9manBseWZleWJ1LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI1MWE3MjUwZi04MWVmLTQwZDAtYTNjNi0xZjAzNTE0YjExYzIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc4MzkyMTMxLCJpYXQiOjE3NzgzODg1MzEsImVtYWlsIjoiYmViZWtheWFtOTMxQGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWxfdmVyaWZpZWQiOnRydWV9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzc4Mzg4NTMxfV0sInNlc3Npb25faWQiOiIzMTQzMmY3Mi0yNWFjLTQ1N2MtOGExNi00NDQ0ZjEyMDM5YzYiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.sr903QRN8WgtLJ5khpGlFG7YT6XGK4TjPSXtYmAIxEangq1F7_EDrrz2Pk9DxCtvQqXjz-B2yDArlnfop48usA";

async function test() {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) {
        console.log("Supabase Auth Error:", error.message);
    } else {
        console.log("Supabase Auth Success:", user?.email);
    }
}

test();
