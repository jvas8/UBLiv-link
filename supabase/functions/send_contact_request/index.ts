import { serve } from "https://deno.land/std/http/server.ts";

const allowedOrigin = "https://ub-liv-link.vercel.app";
const corsHeaders = {
    // 1. Allow access from your specific Vercel frontend URL
    'Access-Control-Allow-Origin': allowedOrigin,
    // 2. Allow POST and preflight OPTIONS requests
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // 3. Allow headers typically sent by Supabase clients (or custom headers)
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, apikey',
};

serve(async (req) => {
    // Handle preflight CORS request (the browser sends an OPTIONS request first)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (!resendApiKey) {
            return new Response(JSON.stringify({ error: "Internal error: API Key not configured." }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders } // Include CORS headers on error
            });
        }

        // 1. Destructure all parameters sent from the frontend
        const { 
            target_landlord_email, 
            sender_student_email, 
            listing_ref, 
            request_type, 
            preferred_date, 
            inquiry_message 
        } = await req.json();

        // 2. Format the subject and body for the landlord
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

        // 3. Call the Resend API
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: "Your App <anything>@pelaabgaie.resend.app",
                to: target_landlord_email,
                subject: subject,
                text: emailBody,
                reply_to: sender_student_email,
            }),
        });

        // 4. Check response status for success
        if (res.ok) {
             return new Response(JSON.stringify({ message: "Email sent successfully." }), { 
                 status: 200,
                 headers: { 'Content-Type': 'application/json', ...corsHeaders } // Include CORS headers on success
             });
        } else {
            // Return specific error from Resend for easier debugging
            const errorData = await res.json();
            return new Response(JSON.stringify({ error: "Failed to send email via Resend.", details: errorData }), { 
                status: 500, 
                headers: { 'Content-Type': 'application/json', ...corsHeaders } // Include CORS headers on failure
            });
        }

    } catch (e) {
        // Handle runtime errors (e.g., invalid JSON)
        return new Response(JSON.stringify({ error: `Internal Server Error: ${e.message}` }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders } // Include CORS headers on internal error
        });
    }
});