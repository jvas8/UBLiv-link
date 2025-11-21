import { serve } from "https://deno.land/std/http/server.ts";

// Define CORS Headers for cross-origin access
const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://ub-liv-link.vercel.app', // IMPORTANT: Change this if your frontend URL changes
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, apikey',
};

serve(async (req) => {
    // 1. Handle Preflight (OPTIONS) and Non-POST Requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), { 
            status: 405, 
            headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        });
    }

    try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (!resendApiKey) {
            console.error("RESEND_API_KEY is not configured in Supabase secrets.");
            return new Response(JSON.stringify({ error: "Internal error: API Key not configured." }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders } 
            });
        }

        // 2. Destructure parameters from the POST request body
        const { 
            target_landlord_email, 
            sender_student_email, 
            listing_ref, 
            request_type, 
            preferred_date, 
            inquiry_message 
        } = await req.json();

        // 🚨 This log confirms data reception
        console.log("Receiving contact request for:", target_landlord_email, "from:", sender_student_email);

        // 3. Format the subject and body for the landlord
        const typeLabel = request_type === 'schedule_visit' ? 'Visit Request' : 'General Inquiry';
        const subject = `New Inquiry for Listing ${listing_ref} (${typeLabel})`;
        
        const emailBody = `
            Dear Landlord,
            A student has submitted a contact request for your listing: ${listing_ref}.
            Request Type: ${typeLabel}
            Preferred Date: ${preferred_date && preferred_date.length > 0 ? preferred_date : 'N/A'}
            --- Student Message ---
            ${inquiry_message}
            ---
            *** IMPORTANT: Please reply directly to this email to contact the student: ${sender_student_email}. ***
        `;

        // 4. Call the Resend API
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                // 🚨 Use the naked test address if your domain is not verified
                from: "onboarding@resend.dev", 
                to: sender_student_email, // <-- ADD THIS LINE
                subject: subject,
                text: emailBody,
                reply_to: sender_student_email,
            }),
        });

        // 5. Check response status for success
        if (res.ok) {
             console.log("Email sent successfully via Resend.");
             return new Response(JSON.stringify({ message: "Email sent successfully." }), { 
                 status: 200,
                 headers: { 'Content-Type': 'application/json', ...corsHeaders }
             });
        } else {
            // 🚨 CRITICAL: Log the error details from Resend API
            const errorData = await res.json();
            console.error("Resend API Error:", errorData);
            return new Response(JSON.stringify({ 
                error: "Failed to send email via Resend.", 
                details: errorData 
            }), { 
                status: 500, 
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

    } catch (e) {
        // Handle runtime errors (e.g., invalid JSON body)
        console.error(`Edge Function Runtime Error: ${e.message}`);
        return new Response(JSON.stringify({ error: `Internal Server Error: ${e.message}` }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        });
    }
});