import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://dquslrxlpmrersnjybym.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdXNscnhscG1yZXJzbmp5YnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNDg4NTYsImV4cCI6MjA3ODcyNDg1Nn0.ICkT2aVP_Ngr3Z24V2b9WLUxvcM-e6B84WkATqt94a8";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

document.addEventListener("DOMContentLoaded", function() {
    console.log("Auth script loaded successfully");
    
    // Tabs
    const loginTab = document.getElementById("loginTab");
    const registerTab = document.getElementById("registerTab");
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const switchToRegister = document.getElementById("switchToRegister");
    const switchToLogin = document.getElementById("switchToLogin");
    
    // Message elements
    const loginMsg = document.getElementById("loginMsg");
    const regMsg = document.getElementById("regMsg");
    
    // Tab switching functionality (Rest of your existing logic)
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

    // Helper to show messages
    function showMessage(element, message, type) {
        element.textContent = message;
        element.className = `msg ${type}`;
    }

    // --- REGISTER FUNCTIONALITY (FIXED) ---
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
                // 1. Create user in Supabase Auth (handles hashing and verification email)
                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email: regEmail,
                    password: regPassword,
                });

                if (authError) {
                    showMessage(regMsg, authError.message, "error");
                    return;
                }
                
                // Determine initial role (defaulting to student is safest)
                // You should implement logic here to determine if they are a student or landlord based on your UI/forms.
                // For now, we'll default to 'student' as a placeholder.
                const userRole = 'student'; 

                // 2. Insert user into USERS table using the secure Auth ID
                const { error: userError } = await supabase
                    .from("users")
                    .insert([
                        {
                            auth_id: authData.user.id, // Use the unique ID from Supabase Auth
                            email: regEmail,
                            full_name: fullname,
                            role: userRole,
                            // **CRITICAL:** Removed storing the password here
                        }
                    ]);
                
                if (userError) {
                    // Log out user if profile insert failed
                    await supabase.auth.signOut(); 
                    showMessage(regMsg, "Account created, but profile failed. Please try again.", "error");
                    return;
                }

                showMessage(regMsg, "Account created! Check your email to confirm your account before logging in.", "success");
                registerForm.reset();

            } catch (error) {
                showMessage(regMsg, "An unexpected error occurred during registration.", "error");
                console.error(error);
            }
        });
    }

    // --- LOGIN FUNCTIONALITY (FIXED) ---
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;

            showMessage(loginMsg, "Signing in...", "loading");

            try {
                // 1. Sign in with Supabase Auth (Securely checks password and verification status)
                const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (authError) {
                    showMessage(loginMsg, authError.message, "error");
                    return;
                }

                // 2. Get user role from USERS table (using the AUTH ID)
                const authId = authData.user.id;
                const { data: userData, error: userError } = await supabase
                    .from("users")
                    .select("role")
                    .eq("auth_id", authId) 
                    .single();

                if (userError || !userData) {
                    // **LOOP PREVENTION:** If session exists but role is missing, sign out and show error.
                    await supabase.auth.signOut();
                    showMessage(loginMsg, "User profile not found. Please contact support.", "error");
                    return;
                }

                showMessage(loginMsg, "Login successful! Redirecting...", "success");

                // 3. Redirect based on role
                if (userData.role === "admin") {
                    window.location.href = "admin-dashboard.html";
                } else if (userData.role === "student") {
                    window.location.href = "student-dashboard.html";
                } else if (userData.role === "landlord") {
                    window.location.href = "landlordDASH.html";
                } else {
                    // Default fallback
                    window.location.href = "student-dashboard.html"; 
                }

            } catch (error) {
                showMessage(loginMsg, "An unexpected login error occurred.", "error");
                console.error(error);
            }
        });
    }

    // --- AUTH STATE CHECK (LOOP PREVENTION) ---
    checkAuthState();

    async function checkAuthState() {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
            // User is already logged in, redirect to appropriate dashboard
            try {
                // We use the auth_id for a quick lookup
                const { data: userData } = await supabase
                    .from("users")
                    .select("role")
                    .eq("auth_id", session.user.id) // Correctly using auth_id
                    .single();

                if (userData) {
                    console.log("User already logged in, redirecting to dashboard...");
                    if (userData.role === "admin") {
                        window.location.href = "admin-dashboard.html";
                    } else if (userData.role === "student") {
                        window.location.href = "student-dashboard.html";
                    } else if (userData.role === "landlord") {
                        window.location.href = "landlordDASH.html";
                    }
                } else {
                    // **CRITICAL LOOP BREAKER:** User has a session but no profile (or wrong role)
                    console.error("Session found but no valid user profile. Signing out to prevent loop.");
                    await supabase.auth.signOut();
                    // Let the page reload or stay on login
                }
            } catch (error) {
                console.error("Error checking auth state, signing out to prevent loop:", error);
                await supabase.auth.signOut();
            }
        }
    }
});