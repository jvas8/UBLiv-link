import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://dquslrxlpmrersnjybym.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdXNscnhscG1yZXJzbmp5YnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNDg4NTYsImV4cCI6MjA3ODcyNDg1Nn0.ICkT2aVP_Ngr3Z24V2b9WLUxvcM-e6B84WkATqt94a8";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

document.addEventListener("DOMContentLoaded", function() {
    console.log("Auth script loaded successfully");
    
    // Elements
    const loginTab = document.getElementById("loginTab");
    const registerTab = document.getElementById("registerTab");
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const switchToRegister = document.getElementById("switchToRegister");
    const switchToLogin = document.getElementById("switchToLogin");
    const loginMsg = document.getElementById("loginMsg");
    const regMsg = document.getElementById("regMsg");

    // --- TAB SWITCHING ---
    function showLogin() {
        loginForm.classList.add("active");
        registerForm.classList.remove("active");
        loginTab.classList.add("active");
        registerTab.classList.remove("active");
    }

    function showRegister() {
        registerForm.classList.add("active");
        loginForm.classList.remove("active");
        registerTab.classList.add("active");
        loginTab.classList.remove("active");
    }

    if (loginTab) loginTab.addEventListener("click", showLogin);
    if (registerTab) registerTab.addEventListener("click", showRegister);
    if (switchToRegister) switchToRegister.addEventListener("click", showRegister);
    if (switchToLogin) switchToLogin.addEventListener("click", showLogin);

    // Helper: Show Messages
    function showMessage(element, message, type) {
        element.textContent = message;
        element.className = `msg ${type}`; // Ensure your CSS has .error and .success classes
    }

    // --- REGISTER FUNCTIONALITY ---
    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const fullname = document.getElementById("fullname").value;
            const regEmail = document.getElementById("regEmail").value;
            const regPassword = document.getElementById("regPassword").value;
            const confirmPassword = document.getElementById("confirmPassword").value;

            showMessage(regMsg, "Creating account...", "loading");

            if (regPassword !== confirmPassword) {
                showMessage(regMsg, "Passwords do not match.", "error");
                return;
            }

            try {
                // 1. Sign up with Supabase Auth
                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email: regEmail,
                    password: regPassword,
                    options: {
                        data: { full_name: fullname },
                         // Metadata for Supabase user object
                         emailRedirectTo: window.location.origin + '/auth.html'
                    }
                });

                if (authError) {
                    showMessage(regMsg, authError.message, "error");
                    return;
                }

                // 2. Insert into PUBLIC.USERS table
                // We do NOT store the password here. Security best practice.
                // We DO store auth_id to link the tables.
                const { error: dbError } = await supabase
                    .from("users")
                    .insert([
                        {
                            auth_id: authData.user.id, // Linking Auth ID
                            name: fullname,
                            email: regEmail,
                            role: 'student' // Default role
                        }
                    ]);

                if (dbError) {
                    console.error("Database Insert Error:", dbError);
                    // Optional: Delete the auth user if the db insert fails to keep data clean
                    showMessage(regMsg, "Account created in Auth but failed to save profile. Please contact support.", "error");
                    return;
                }

                showMessage(regMsg, "Success! Please check your email to verify your account.", "success");
                registerForm.reset();

            } catch (err) {
                console.error("Unexpected Error:", err);
                showMessage(regMsg, "An unexpected error occurred.", "error");
            }
        });
    }

    // --- LOGIN FUNCTIONALITY ---
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;

            showMessage(loginMsg, "Verifying credentials...", "loading");

            try {
                // 1. Authenticate with Supabase
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (error) {
                    showMessage(loginMsg, "Invalid email or password.", "error");
                    return;
                }

                // 2. CHECK EMAIL VERIFICATION [The Fix]
                // If email_confirmed_at is null, they haven't clicked the link.
                if (!data.user.email_confirmed_at) {
                    await supabase.auth.signOut(); // Kick them out immediately
                    showMessage(loginMsg, "Please verify your email address before logging in.", "error");
                    return;
                }

                showMessage(loginMsg, "Login successful! Redirecting...", "success");

                // 3. Get User Role from 'users' table using auth_id
                const { data: userData, error: userError } = await supabase
                    .from("users")
                    .select("role")
                    .eq("auth_id", data.user.id) // Secure lookup using auth_id
                    .single();

                if (userError || !userData) {
                    console.error("User Profile Error:", userError);
                    showMessage(loginMsg, "Profile not found. Please contact support.", "error");
                    await supabase.auth.signOut();
                    return;
                }

                // 4. Redirect based on role
                redirectUser(userData.role);

            } catch (err) {
                console.error("Login Error:", err);
                showMessage(loginMsg, "An unexpected error occurred.", "error");
            }
        });
    }

    // --- AUTO-LOGIN CHECK (On Page Load) ---
    checkAuthState();

    async function checkAuthState() {
        // Get current session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
            // 1. Verify Email Status for existing session
            if (!session.user.email_confirmed_at) {
                console.log("User has session but email not verified. Signing out.");
                await supabase.auth.signOut();
                return; // Stay on auth page
            }

            // 2. Fetch Role and Redirect
            try {
                const { data: userData } = await supabase
                    .from("users")
                    .select("role")
                    .eq("auth_id", session.user.id)
                    .single();

                if (userData) {
                    redirectUser(userData.role);
                }
            } catch (error) {
                console.error("Auth State Check Error:", error);
            }
        }
    }

    // Helper: Centralized Redirect Logic
    function redirectUser(role) {
        if (role === "admin") {
            window.location.href = "admin-dashboard.html";
        } else if (role === "student") {
            window.location.href = "student-dashboard.html";
        } else if (role === "landlord") {
            window.location.href = "landlordDASH.html";
        } else {
            window.location.href = "student-dashboard.html"; // Fallback
        }
    }
});