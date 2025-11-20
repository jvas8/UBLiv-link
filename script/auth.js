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
    // REGISTER FUNCTIONALITY
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
                        }
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

                // Insert user into USERS table
                const { error: userError } = await supabase
                    .from("users")
                    .insert([
                        {
                            name: fullName,
                            email: email,
                            password: password,
                            role: role,
                            auth_id: authData.user?.id
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
    // LOGIN FUNCTIONALITY - FIXED FILE PATHS
    // ----------------------
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;

            showMessage(loginMsg, "Signing in...", "loading");

            try {
                // FIRST: Check if user exists in USERS table and password matches
                const { data: userData, error: userError } = await supabase
                    .from("users")
                    .select("*")
                    .eq("email", email)
                    .single();

                console.log("User data:", userData, "Error:", userError);

                if (userError || !userData) {
                    showMessage(loginMsg, "Invalid email or password.", "error");
                    return;
                }

                // Check password
                if (userData.password !== password) {
                    showMessage(loginMsg, "Invalid email or password.", "error");
                    return;
                }

                // If password matches, sign in with Supabase Auth
                const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (authError) {
                    console.warn("Supabase auth error, but USERS table login successful:", authError);
                    // Continue with redirect since USERS table authentication passed
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
                        // FIXED: This was pointing to wrong file name
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
                    .eq("email", session.user.email)
                    .single();

                if (userData) {
                    console.log("User already logged in, redirecting to dashboard...");
                    if (userData.role === "admin") {
                        window.location.href = "admin-dashboard.html";
                    } else if (userData.role === "student") {
                        window.location.href = "student-dashboard.html";
                    } else if (userData.role === "landlord") {
                        // FIXED: This was pointing to wrong file name
                        window.location.href = "landlordDASH.html";
                    }
                }
            } catch (error) {
                console.error("Error checking auth state:", error);
            }
        }
    }
});