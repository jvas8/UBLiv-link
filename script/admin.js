// admin.js - CORRECTED, CHART REMOVED, AND LOGOUT ADDED

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Supabase client definition (Using your previously provided details)
const supabaseUrl = "https://dquslrxlpmrersnjybym.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdXNscnhscG1yZXJzbmp5YnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNDg4NTYsImV4cCI6MjA3ODcyNDg1Nn0.ICkT2aVP_Ngr3Z24V2b9WLUxvcM-e6B84WkATqt94a8";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

let currentUserID = null;

/**
 * Handles the Supabase sign-out process and redirects to the login page.
 */
async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error("Logout Error:", error);
    }
    // Redirect to the login page (assuming it's at the root '/')
    window.location.replace('/'); 
}

/**
 * Ensures the user is logged in AND has the 'admin' role. 
 * This acts as a security gate on the admin-dashboard page.
 */
async function checkAuthAndRedirect() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
        console.log("No active session found. Redirecting to login.");
        // Redirect to the login page
        window.location.replace('/'); 
        return { authorized: false };
    }
    
    const userEmail = session.user.email; 

    // 1. Check the user's role in the 'users' table using email
    const { data: user, error: userError } = await supabase
        .from('users') 
        .select('role, user_id') 
        .eq('email', userEmail) 
        .single();

    if (userError || !user || user.role !== 'admin') {
        console.error("User is not an admin, profile not found, or error during role check.", userError);
        alert("Access Denied. You must be an administrator to view this page.");
        // Sign out and redirect if not an admin
        await supabase.auth.signOut();
        window.location.replace('/'); 
        return { authorized: false };
    }
    
    currentUserID = user.user_id; 
    return { authorized: true };
}

/**
 * Fetches all necessary count data for the Admin Overview dashboard.
 * Uses the correct schema columns: verification_status, availability, role.
 */
async function fetchOverviewData() {
    const results = {};

    try {
        console.log("Starting fetchOverviewData...");

        // 1. Listings Pending Verification
        let { data: pendingData, count: pendingCount, error: pendingError } = await supabase
            .from('listings')
            .select('*', { count: 'exact', head: false }); // Remove head: true to see actual data

        console.log("Pending listings query result:", { pendingData, pendingCount, pendingError });

        if (pendingError) {
            console.error("Supabase Error fetching pending count:", pendingError);
            results.pendingVerificationCount = 'Error';
        } else {
            // Filter for pending status manually
            const pendingListings = pendingData ? pendingData.filter(listing => listing.verification_status === 'pending') : [];
            results.pendingVerificationCount = pendingListings.length;
            console.log("Filtered pending listings:", pendingListings);
        }

        // 2. Total Active Listings
        let { data: activeData, count: activeCount, error: activeError } = await supabase
            .from('listings')
            .select('*', { count: 'exact', head: false });

        console.log("Active listings query result:", { activeData, activeCount, activeError });

        if (activeError) {
            console.error("Error fetching active listings:", activeError);
            results.totalActiveListings = 'Error';
        } else {
            const activeListings = activeData ? activeData.filter(listing => listing.availability === true) : [];
            results.totalActiveListings = activeListings.length;
        }

        // 3. Total Landlord Registrations
        let { data: landlordData, count: landlordCount, error: landlordError } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: false })
            .eq('role', 'landlord');

        console.log("Landlord query result:", { landlordData, landlordCount, landlordError });

        if (landlordError) {
            console.error("Error fetching landlords:", landlordError);
            results.totalLandlords = 'Error';
        } else {
            results.totalLandlords = landlordCount || 0;
        }

    } catch (error) {
        console.error("Fatal Error fetching overview data:", error);
        return {
            pendingVerificationCount: 'Error',
            totalActiveListings: 'Error',
            totalLandlords: 'Error',
        };
    }
    
    console.log("Final results:", results);
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
    
    // Verification Queue Progress Bar update 
    const totalPending = parseInt(data.pendingVerificationCount);
    
    // *** MODIFICATION START ***
    // NOTE: 'verified-count' is currently hardcoded in admin-dashboard.html (value='5'). 
    // We will use the count of *successfully verified* listings from the report section as a more meaningful progress goal.
    // For now, let's calculate a "Verified Today" count from the *Verification Report* table data, or default to a reasonable number.
    
    // This is a placeholder for a count of *recently completed* verifications, as there is no live 'verified_today' count from the DB.
    // The goal here is to fix the visual goal on the Queue section.
    const mockVerifiedCount = 5; // Revert to fixed '5' for the display element text.
    document.getElementById('verified-count').textContent = mockVerifiedCount; // Keep the '5' for the text.

    // Update the 'Total Pending' count with the live data.
    document.getElementById('total-pending').textContent = totalPending; 

    const progressBar = document.getElementById('uba-progress-bar');
    if (totalPending > 0) {
        // Calculate the percentage based on the mock verified count against the total pending listings.
        const percentage = (Math.min(mockVerifiedCount, totalPending) / totalPending) * 100;
        progressBar.style.width = `${percentage}%`;
    } else {
        progressBar.style.width = '100%';
    }
}

// ===========================================
// UI Logic 
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

    switchModule('uba-overview', document.querySelector('[href="#uba-overview"]'));
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
    
    function handleVerificationAction(e, action) {
        e.preventDefault();
        const listingRow = e.target.closest('.uba-table-row');
        const statusElement = listingRow.querySelector('.uba-status');
        
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


function setupVerificationForm() {
    const formContainer = document.getElementById('uba-verification-form-container');
    const openFormButtons = document.querySelectorAll('.uba-verify-form-btn');
    const closeFormButton = document.querySelector('.uba-close-form-btn');
    const cancelFormButton = document.querySelector('.uba-cancel-form-btn');
    const verificationForm = document.getElementById('uba-verification-form');

    function openForm(listingId, landlordName) {
        document.getElementById('uba-listing-id').value = listingId;
        document.getElementById('uba-landlord-name').value = landlordName;
        formContainer.style.display = 'block';
        
        // Scroll to form
        formContainer.scrollIntoView({ behavior: 'smooth' });
    }

    function closeForm() {
        formContainer.style.display = 'none';
        verificationForm.reset();
    }

    // Event listeners for opening forms
    openFormButtons.forEach(button => {
        button.addEventListener('click', () => {
            const listingId = button.getAttribute('data-listing-id');
            const row = button.closest('.uba-table-row');
            const landlordName = row.querySelector('div:first-child').textContent.split('(')[1].replace(')', '').trim();
            openForm(listingId, landlordName);
        });
    });

    // Event listeners for closing forms
    closeFormButton.addEventListener('click', closeForm);
    cancelFormButton.addEventListener('click', closeForm);

    // Form submission
    verificationForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const listingId = document.getElementById('uba-listing-id').value;
        const status = document.getElementById('uba-status').value;
        const notes = document.getElementById('uba-notes').value;

        // Update the table row
        const row = document.querySelector(`[data-listing-id="${listingId}"]`);
        if (row) {
            const statusElement = row.querySelector('.uba-status');
            if (status === 'verified') {
                statusElement.textContent = 'VERIFIED';
                statusElement.className = 'uba-status uba-status-verified';
            } else {
                statusElement.textContent = 'REJECTED';
                statusElement.className = 'uba-status uba-status-rejected';
            }
        }

        // Show success message
        alert(`Listing ${listingId} has been ${status === 'verified' ? 'verified' : 'rejected'} successfully!`);
        
        // Close form
        closeForm();
    });
}

function setupReportFilters() {
    // Verification report filtering
    const searchInput = document.getElementById('uba-search-input');
    const filterStatus = document.getElementById('uba-filter-status');
    const verificationTable = document.getElementById('uba-verification-table');
    const noResults = document.getElementById('uba-no-results');

    function filterVerificationTable() {
        const searchTerm = searchInput.value.toLowerCase();
        const statusFilter = filterStatus.value;
        const rows = verificationTable.getElementsByTagName('tr');
        let visibleCount = 0;

        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].getElementsByTagName('td');
            const propertyName = cells[0].textContent.toLowerCase();
            const status = cells[1].textContent.toLowerCase();

            const matchesSearch = propertyName.includes(searchTerm);
            const matchesStatus = statusFilter === 'all' || status.includes(statusFilter);

            if (matchesSearch && matchesStatus) {
                rows[i].style.display = '';
                visibleCount++;
            } else {
                rows[i].style.display = 'none';
            }
        }

        noResults.style.display = visibleCount === 0 ? 'block' : 'none';
    }

    searchInput.addEventListener('input', filterVerificationTable);
    filterStatus.addEventListener('change', filterVerificationTable);

    // Review report filtering
    const reviewSearchInput = document.getElementById('uba-review-search-input');
    const filterRating = document.getElementById('uba-filter-rating');
    const reviewTable = document.getElementById('uba-review-table');
    const reviewNoResults = document.getElementById('uba-review-no-results');

    function filterReviewTable() {
        const searchTerm = reviewSearchInput.value.toLowerCase();
        const ratingFilter = filterRating.value;
        const rows = reviewTable.getElementsByTagName('tr');
        let visibleCount = 0;

        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].getElementsByTagName('td');
            const propertyName = cells[0].textContent.toLowerCase();
            const rating = cells[1].textContent.match(/\d/)[0];

            const matchesSearch = propertyName.includes(searchTerm);
            const matchesRating = ratingFilter === 'all' || rating === ratingFilter;

            if (matchesSearch && matchesRating) {
                rows[i].style.display = '';
                visibleCount++;
            } else {
                rows[i].style.display = 'none';
            }
        }

        reviewNoResults.style.display = visibleCount === 0 ? 'block' : 'none';
    }

    reviewSearchInput.addEventListener('input', filterReviewTable);
    filterRating.addEventListener('change', filterReviewTable);
}

// Export functions
function ubaExportReport() {
    alert('📋 Verification report exported successfully!');
}

function ubaExportReviewReport() {
    alert('📊 Review report exported successfully as CSV!');
}

// --- Main Execution ---
document.addEventListener("DOMContentLoaded", async function() {
    // 1. Authentication Check
    const { authorized } = await checkAuthAndRedirect();
    if (!authorized) return;
    
    // 2. Setup UI
    setupNavigation();
    setupQueueActions();
    setupVerificationForm();
    setupReportFilters();

    // 3. Attach Logout Listener
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // 4. Fetch and Render Overview Data
    const data = await fetchOverviewData();
    renderOverviewData(data);
});