import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) => {
    try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (!resendApiKey) {
            return new Response(JSON.stringify({ error: "Internal error: API Key not configured." }), { status: 500 });
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
                from: "Your App <onboarding@resend.dev>",
                to: target_landlord_email,
                subject: subject,
                text: emailBody, // Use the complete, formatted body
                reply_to: sender_student_email,
            }),
        });

        // 4. Check response status for success
        if (res.ok) {
             return new Response(JSON.stringify({ message: "Email sent successfully." }), { status: 200 });
        } else {
            // Return specific error from Resend for easier debugging
            const errorData = await res.json();
            return new Response(JSON.stringify({ error: "Failed to send email via Resend.", details: errorData }), { status: 500 });
        }

    } catch (e) {
        // Handle runtime errors (e.g., invalid JSON)
        return new Response(JSON.stringify({ error: `Internal Server Error: ${e.message}` }), { status: 500 });
    }
});