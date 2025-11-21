// admin.js

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Supabase client definition (Using your previously provided details)
const supabaseUrl = "https://dquslrxlpmrersnjybym.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdXNscnhscG1yZXJzbmp5YnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNDg4NTYsImV4cCI6MjA3ODcyNDg1Nn0.ICkT2aVP_Ngr3Z24V2b9WLUxvcM-e6B84WkATqt94a8";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

let currentUserID = null;

/**
 * Ensures the user is logged in AND has the 'admin' role. Redirects otherwise.
 */
async function checkAuthAndRedirect() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
        console.log("No active session found. Redirecting to login.");
        // Redirect to the login page
        window.location.replace('/'); 
        return { authorized: false };
    }

    currentUserID = session.user.id;

    // Check the user's role in the profiles table
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', currentUserID)
        .single();

    if (profileError || !profile || profile.role !== 'admin') {
        console.error("User is not an admin or profile not found.", profileError);
        alert("Access Denied. You must be an administrator to view this page.");
        // Sign out and redirect if not an admin
        await supabase.auth.signOut();
        window.location.replace('/'); 
        return { authorized: false };
    }
    
    return { authorized: true };
}

/**
 * Fetches all necessary count data for the Admin Overview dashboard.
 */
async function fetchOverviewData() {
    const results = {};

    try {
        // 1. Listings Pending Verification (is_verified = FALSE)
        let { count: pendingCount, error: pendingError } = await supabase
            .from('listings')
            .select('*', { count: 'exact', head: true })
            .eq('is_verified', false);

        if (pendingError) throw pendingError;
        results.pendingVerificationCount = pendingCount || 0;

        // 2. Total Active Listings (is_active = TRUE)
        let { count: activeCount, error: activeError } = await supabase
            .from('listings')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        if (activeError) throw activeError;
        results.totalActiveListings = activeCount || 0;

        // 3. Total Landlord Registrations (role = 'landlord' in profiles table)
        let { count: landlordCount, error: landlordError } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'landlord');

        if (landlordError) throw landlordError;
        results.totalLandlords = landlordCount || 0;

        // 4. Critical Reviews Flagged (Assuming is_flagged = TRUE in a reviews table)
        let { count: flaggedCount, error: flaggedError } = await supabase
            .from('reviews') // Ensure you have a 'reviews' table
            .select('*', { count: 'exact', head: true })
            .eq('is_flagged', true); // Assuming a column named 'is_flagged'

        if (flaggedError) {
            console.warn("Could not fetch flagged reviews. Assuming 0.", flaggedError.message);
            results.criticalReviewsFlagged = 0; // Use 0 if the table/column is missing
        } else {
            results.criticalReviewsFlagged = flaggedCount || 0;
        }

    } catch (error) {
        console.error("Error fetching overview data:", error.message);
        return {
            pendingVerificationCount: 'N/A',
            totalActiveListings: 'N/A',
            totalLandlords: 'N/A',
            criticalReviewsFlagged: 'N/A'
        };
    }
    
    return results;
}

/**
 * Renders the fetched data into the overview cards in the DOM.
 */
function renderOverviewData(data) {
    // Overview Stats
    document.getElementById('pending-verification-count').textContent = data.pendingVerificationCount;
    document.getElementById('active-listings-count').textContent = data.totalActiveListings;
    document.getElementById('landlord-count').textContent = data.totalLandlords;
    document.getElementById('flagged-reviews-count').textContent = data.criticalReviewsFlagged;
    
    // Verification Queue Progress Bar update
    const totalPending = data.pendingVerificationCount;
    const mockVerifiedCount = 5; // Keeping this conceptual until verification logic is built
    
    document.getElementById('total-pending').textContent = totalPending;
    // document.getElementById('verified-count').textContent is set by the handleVerificationAction for now

    const progressBar = document.getElementById('uba-progress-bar');
    if (totalPending > 0) {
        // Calculate percentage based on mock-verified vs. real-pending
        const percentage = (mockVerifiedCount / totalPending) * 100;
        progressBar.style.width = `${percentage}%`;
    } else {
        progressBar.style.width = '100%';
    }
}

// ===========================================
// UI Logic (Moved from the HTML script block)
// ===========================================

function setupNavigation() {
    const navItems = document.querySelectorAll('.uba-nav-item');
    const modules = document.querySelectorAll('.uba-module');

    function switchModule(targetId, navElement) {
        navItems.forEach(nav => nav.classList.remove('active'));
        if (navElement) {
            navElement.classList.add('active');
        }
        modules.forEach(mod => mod.classList.remove('active'));
        const targetModule = document.getElementById(targetId);
        if (targetModule) {
            targetModule.classList.add('active');
        }
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = e.currentTarget.getAttribute('href').substring(1);
            switchModule(targetId, e.currentTarget);
        });
    });

    // Initial switch to overview
    switchModule('uba-overview', document.querySelector('[href="#uba-overview"]'));
}

function setupVerificationChart() {
    const ctx = document.getElementById('conversion-chart');
    if (window.Chart && ctx) { // Use Chart.js only if it's available
         new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Sept', 'Oct', 'Nov', 'Dec'],
                datasets: [{
                    label: 'Verification Rate (%)',
                    data: [85, 90, 88, 92], // Mock data for now
                    borderColor: 'rgb(93, 45, 145)', 
                    backgroundColor: 'rgba(93, 45, 145, 0.1)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 3,
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Verification Rate (%)'
                        }
                    }
                }
            }
        });
    }
}

function setupQueueActions() {
    window.openAdminLog = function() {
        alert("Opening the System Audit Log (conceptual)...");
    };
    document.querySelectorAll('.uba-report-card form, .uba-settings-card form').forEach(form => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            alert(`Report generated! Parameters: ${new FormData(form).get('report-type') || new FormData(form).get('ai-flag')}`);
        });
    });

    document.querySelectorAll('.uba-verify-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleVerificationAction(e, 'verify'));
    });

    document.querySelectorAll('.uba-reject-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleVerificationAction(e, 'reject'));
    });
    
    // Mock action handler for now
    function handleVerificationAction(e, action) {
        e.preventDefault();
        const listingRow = e.target.closest('.uba-table-row');
        const listingId = listingRow.dataset.listingId;
        const statusElement = listingRow.querySelector('.uba-status');
        
        // This is where you would call a Supabase function to UPDATE the listing status.
        // For now, it's just a UI change.
        if (statusElement.textContent.trim() !== 'PENDING') return;

        listingRow.style.opacity = 0.5;
        
        setTimeout(() => {
            if (action === 'verify') {
                statusElement.textContent = 'VERIFIED';
                statusElement.className = 'uba-status';
                statusElement.style.backgroundColor = '#d4edda';
                statusElement.style.color = '#155724';
            } else if (action === 'reject') {
                statusElement.textContent = 'REJECTED';
                statusElement.className = 'uba-status';
                statusElement.style.backgroundColor = '#f8d7da';
                statusElement.style.color = '#721c24';
            }
            
            listingRow.style.opacity = 1;
            listingRow.querySelectorAll('.uba-verify-btn, .uba-reject-btn').forEach(btn => btn.disabled = true);
        }, 800);
    }
}


// --- Main Execution ---
document.addEventListener("DOMContentLoaded", async function() {
    // 1. Authentication Check
    const { authorized } = await checkAuthAndRedirect();
    if (!authorized) return;
    
    // 2. Setup UI
    setupNavigation();
    setupVerificationChart();
    setupQueueActions();

    // 3. Fetch and Render Overview Data
    const data = await fetchOverviewData();
    renderOverviewData(data);
});