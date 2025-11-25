import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://dquslrxlpmrersnjybym.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdXNscnhscG1yZXJzbmp5YnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNDg4NTYsImV4cCI6MjA3ODcyNDg1Nn0.ICkT2aVP_Ngr3Z24V2b9WLUxvcM-e6B84WkATqt94a8";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Function to handle email verification redirects
async function handleEmailVerification() {
    try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
            console.error('Error getting session:', error);
            window.location.href = 'auth.html';
            return;
        }
        
        if (data.session) {
            // User is authenticated, get their role and redirect
            const { data: userData, error: userError } = await supabase
                .from("users")
                .select("role")
                .eq("auth_id", data.session.user.id)
                .single();

            if (userError) {
                console.error('Error fetching user data:', userError);
                window.location.href = 'auth.html';
                return;
            }

            if (userData) {
                console.log("Email verified! Redirecting user with role:", userData.role);
                if (userData.role === "admin") {
                    window.location.href = "admin-dashboard.html";
                } else if (userData.role === "student") {
                    window.location.href = "student-dashboard.html";
                } else if (userData.role === "landlord") {
                    window.location.href = "landlordDASH.html";
                } else {
                    window.location.href = "student-dashboard.html";
                }
            } else {
                window.location.href = 'auth.html';
            }
        } else {
            window.location.href = 'auth.html';
        }
    } catch (err) {
        console.error('Unexpected error in email verification:', err);
        window.location.href = 'auth.html';
    }
}

document.addEventListener("DOMContentLoaded", function() {
    console.log("Auth script loaded successfully");
    
    // Check if we're on the email verification callback page
    if (window.location.pathname.includes('auth-callback.html') || 
        document.title.includes('Verifying Email')) {
        console.log("Handling email verification callback...");
        handleEmailVerification();
        return; // Stop further execution for callback page
    }
    
    // Regular authentication page functionality
    // Tabs
    const loginTab = document.getElementById("loginTab");
    const registerTab = document.getElementById("registerTab");
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const switchToRegister = document.getElementById("switchToRegister");
    const switchToLogin = document.getElementById("switchToLogin");

    // Tab switching functionality
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

    // Event listeners for tab switching
    if (loginTab) loginTab.addEventListener("click", showLogin);
    if (registerTab) registerTab.addEventListener("click", showRegister);
    if (switchToRegister) switchToRegister.addEventListener("click", (e) => { e.preventDefault(); showRegister(); });
    if (switchToLogin) switchToLogin.addEventListener("click", (e) => { e.preventDefault(); showLogin(); });

    // Message elements
    const loginMsg = document.getElementById("loginMsg") || createMessageElement(loginForm);
    const regMsg = document.getElementById("regMsg") || createMessageElement(registerForm);

    // ----------------------
    // REGISTER FUNCTIONALITY - REMOVED PASSWORD STORAGE
    // ----------------------
    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            const fullName = document.getElementById("fullname").value;
            const email = document.getElementById("regEmail").value;
            const password = document.getElementById("regPassword").value;
            const confirmPassword = document.getElementById("confirmPassword").value;

            // Validation
            if (password !== confirmPassword) {
                showMessage(regMsg, "Passwords do not match.", "error");
                return;
            }

            if (password.length < 6) {
                showMessage(regMsg, "Password must be at least 6 characters long.", "error");
                return;
            }

            showMessage(regMsg, "Creating account...", "loading");

            try {
                // Create user in Supabase Auth
                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            full_name: fullName
                        },
                        emailRedirectTo: `${window.location.origin}/auth-callback.html`
                    }
                });

                if (authError) {
                    showMessage(regMsg, authError.message, "error");
                    return;
                }

                // Determine role based on email domain
                let role = "landlord"; // default
                if (email.endsWith("@ub.edu.bz")) {
                    role = "student";
                }
                // Add specific admin email checks
                if (email === "admin@ublivlink.ub.edu.bz" || email === "housing@ub.edu.bz") {
                    role = "admin";
                }

                // Insert user into USERS table WITHOUT PASSWORD - using auth_id only
                const { error: userError } = await supabase
                    .from("users")
                    .insert([
                        {
                            name: fullName,
                            email: email,
                            role: role,
                            auth_id: authData.user?.id
                            // PASSWORD FIELD REMOVED - handled by Supabase Auth
                        }
                    ]);

                if (userError) {
                    console.error("User creation error:", userError);
                    showMessage(regMsg, "Error creating user profile: " + userError.message, "error");
                    return;
                }

                showMessage(regMsg, "Account created successfully! Please check your email to verify your account.", "success");
                
                // Clear form
                registerForm.reset();
                
                // Switch to login after successful registration
                setTimeout(() => {
                    showLogin();
                }, 3000);

            } catch (error) {
                console.error("Registration error:", error);
                showMessage(regMsg, "An unexpected error occurred: " + error.message, "error");
            }
        });
    }

    // ----------------------
    // LOGIN FUNCTIONALITY - FIXED AUTHENTICATION FLOW
    // ----------------------
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;

            showMessage(loginMsg, "Signing in...", "loading");

            try {
                // STEP 1: Sign in with Supabase Auth (handles password verification)
                const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (authError) {
                    showMessage(loginMsg, authError.message, "error");
                    return;
                }

                // Check if email is verified
                if (!authData.user?.email_confirmed_at && !authData.user?.confirmed_at) {
                    showMessage(loginMsg, "Please verify your email before logging in.", "error");
                    await supabase.auth.signOut();
                    return;
                }

                // STEP 2: Get user role from USERS table using auth_id
                const authId = authData.user.id;
                const { data: userData, error: userError } = await supabase
                    .from("users")
                    .select("role")
                    .eq("auth_id", authId)
                    .single();

                if (userError || !userData) {
                    // Log out the user from Supabase if their profile is missing
                    await supabase.auth.signOut();
                    showMessage(loginMsg, "User profile not found. Please register.", "error");
                    return;
                }

                showMessage(loginMsg, "Login successful! Redirecting...", "success");

                // Redirect based on user role - FIXED FILE PATHS
                setTimeout(() => {
                    console.log("Redirecting user with role:", userData.role);
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
                }, 1500);

            } catch (error) {
                console.error("Login error:", error);
                showMessage(loginMsg, "An unexpected error occurred: " + error.message, "error");
            }
        });
    }

    // Helper function to show messages
    function showMessage(element, message, type) {
        if (!element) return;
        
        element.textContent = message;
        element.style.color = type === "error" ? "red" : 
                            type === "success" ? "green" : 
                            "#7D2D91";
    }

    // Helper function to create message element if it doesn't exist
    function createMessageElement(form) {
        const msgElement = document.createElement("p");
        msgElement.className = "msg";
        form.appendChild(msgElement);
        return msgElement;
    }

    // Check if user is already logged in - FIXED FILE PATHS
    checkAuthState();

    async function checkAuthState() {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
            // User is already logged in, redirect to appropriate dashboard
            try {
                const { data: userData } = await supabase
                    .from("users")
                    .select("role")
                    .eq("auth_id", session.user.id)
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
                }
            } catch (error) {
                console.error("Error checking auth state:", error);
            }
        }
    }
});