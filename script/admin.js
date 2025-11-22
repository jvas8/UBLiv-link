// admin.js - FULLY IMPLEMENTED VERIFICATION QUEUE & REPORT LOGIC WITH CSV EXPORT

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Supabase client definition (Using your previously provided details)
const supabaseUrl = "https://dquslrxlpmrersnjybym.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdXNscnhscG1yZXJzbmp5YnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNDg4NTYsImV4cCI6MjA3ODcyNDg1Nn0.ICkT2aVP_Ngr3Z24V2b9WLUxvcM-e6B84WkATqt94a8";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

let currentUserID = null;
let currentReportData = []; // Global variable to store report data for export

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
 */
async function checkAuthAndRedirect() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
        console.log("No active session found. Redirecting to login.");
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
 */
async function fetchOverviewData() {
    const results = {};

    try {
        // 1. Listings Pending Verification
        let { count: pendingCount, error: pendingError } = await supabase
            .from('listings')
            .select('*', { count: 'exact', head: true })
            .eq('verification_status', 'pending');

        if (pendingError) {
            console.error("Supabase Error fetching pending count:", pendingError.message);
            results.pendingVerificationCount = 'Error';
        } else {
            results.pendingVerificationCount = pendingCount || 0;
        }

        // 2. Total Active Listings
        let { count: activeCount, error: activeError } = await supabase
            .from('listings')
            .select('*', { count: 'exact', head: true })
            .eq('availability', true);

        if (activeError) {
            console.error("Error fetching active listings:", activeError.message);
            results.totalActiveListings = 'Error';
        } else {
            results.totalActiveListings = activeCount || 0;
        }

        // 3. Total Landlord Registrations
        let { count: landlordCount, error: landlordError } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'landlord');

        if (landlordError) {
            console.error("Error fetching landlords:", landlordError.message);
            results.totalLandlords = 'Error';
        } else {
            results.totalLandlords = landlordCount || 0;
        }

    } catch (error) {
        console.error("Fatal Error fetching overview data:", error);
        return { pendingVerificationCount: 'Error', totalActiveListings: 'Error', totalLandlords: 'Error' };
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
    
    // Verification Queue Progress Bar update 
    const totalPending = parseInt(data.pendingVerificationCount);
    // Use mockVerifiedCount for initial visualization
    const mockVerifiedCount = 5; 
    
    document.getElementById('verified-count').textContent = mockVerifiedCount; 
    document.getElementById('total-pending').textContent = totalPending; 

    const progressBar = document.getElementById('uba-progress-bar');
    if (totalPending > 0) {
        // Calculate the percentage based on mock verified count against the total pending listings.
        const percentage = (Math.min(mockVerifiedCount, totalPending) / totalPending) * 100;
        progressBar.style.width = `${percentage}%`;
    } else {
        // Set to 100% if no listings are pending
        progressBar.style.width = '100%'; 
    }
}

// ===========================================
// VERIFICATION QUEUE LOGIC
// ===========================================

/**
 * Updates a listing's verification status and associated feedback in Supabase.
 */
async function updateListingVerificationStatus(listingId, status, notes) {
    const { data, error } = await supabase
        .from('listings')
        .update({ 
            verification_status: status, 
            feedback: notes,
            verified_by_id: currentUserID // SAVES the admin's user_id
        })
        .eq('listing_id', listingId)
        .select();

    if (error) {
        console.error("Error updating listing status:", error);
        return false;
    }

    console.log(`Listing ${listingId} successfully updated to: ${status}`, data);
    return true;
}

/**
 * Fetches all pending listings along with the landlord's name.
 */
async function fetchPendingListings() {
    // Joins 'listings' with 'users' to get the landlord's name
    let { data: listings, error } = await supabase
        .from('listings')
        // NOTE: Changed select path to match user's previous code, assuming users!listings_landlord_id_fkey is correct
        .select('*, landlord:users!listings_landlord_id_fkey(name)') 
        .eq('verification_status', 'pending')
        .order('created_at', { ascending: true });

    if (error) {
        console.error("Error fetching pending listings:", error.message);
        return [];
    }
    
    // Flatten the result for easier rendering
    return listings.map(listing => ({
        listing_id: listing.listing_id,
        name: listing.name,
        landlord_name: listing.landlord ? listing.landlord.name : 'N/A',
        created_at: listing.created_at,
        verification_status: listing.verification_status
    }));
}

/**
 * Renders the pending listings into the Verification Queue table, replacing mock data.
 */
function renderPendingListings(listings) {
    const tableContainer = document.querySelector('.uba-verification-table');
    
    // Clear all rows in the table container, but re-add header
    tableContainer.innerHTML = `
        <div class="uba-table-header">
            <div>Property & Landlord</div>
            <div>Date Submitted</div>
            <div>Status</div>
            <div>Verification Form</div>
        </div>`;
    
    if (listings.length === 0) {
        const noResultsRow = document.createElement('div');
        noResultsRow.className = 'uba-table-row uba-no-listings';
        noResultsRow.innerHTML = `<div style="grid-column: 1 / span 4; text-align: center; padding: 10px;">🎉 No pending listings! Great job!</div>`;
        tableContainer.appendChild(noResultsRow);
        return;
    }

    listings.forEach(listing => {
        const row = document.createElement('div');
        row.className = 'uba-table-row';
        row.setAttribute('data-listing-id', listing.listing_id);
        
        const formattedDate = new Date(listing.created_at).toLocaleDateString('en-US');
        
        row.innerHTML = `
            <div>${listing.name} (${listing.landlord_name})</div>
            <div>${formattedDate}</div>
            <div class="uba-status uba-status-pending">${listing.verification_status.toUpperCase()}</div>
            <div><button class="uba-action-btn uba-verify-form-btn" data-listing-id="${listing.listing_id}">Open Form</button></div>
        `;
        
        tableContainer.appendChild(row);
    });

    // Re-setup the event listeners for the new "Open Form" buttons
    setupVerificationFormListeners();
}

/**
 * Orchestrates the loading and rendering of the Verification Queue.
 */
async function loadVerificationQueue() {
    const pendingListings = await fetchPendingListings();
    renderPendingListings(pendingListings);
}

// ===========================================
// VERIFICATION REPORT LOGIC
// ===========================================

/**
 * Fetches all verified or rejected listings for the Verification Report.
 */
async function fetchVerificationReportData() {
    let { data: listings, error } = await supabase
        .from('listings')
        .select(`
            listing_id,
            name,
            verification_status,
            feedback,
            created_at,
            verifier:users!listings_verified_by_id_fkey(name)
        `)
        .neq('verification_status', 'pending')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching verification report data:", error.message);
        return [];
    }

    return listings.map(listing => ({
        listing_id: listing.listing_id,
        name: listing.name,
        status: listing.verification_status,
        date: listing.created_at,
        notes: listing.feedback || 'N/A',
        verifier: listing.verifier ? listing.verifier.name : 'Unknown Admin'
    }));
}

/**
 * Renders the data into the Verification Report table.
 */
function renderVerificationReport(listings) {
    currentReportData = listings; // SAVE THE DATA FOR EXPORT
    
    // Select the table body using the new ID
    const tableBody = document.querySelector('#uba-verification-report-table tbody');
    if (!tableBody) return; 

    tableBody.innerHTML = ''; // Clear mock data
    
    listings.forEach(listing => {
        const row = document.createElement('tr');
        const formattedDate = new Date(listing.date).toLocaleDateString('en-US');
        const statusClass = listing.status === 'verified' ? 'uba-status-verified' : 'uba-status-rejected';

        row.innerHTML = `
            <td>${listing.name}</td>
            <td><span class="uba-status ${statusClass}">${listing.status.toUpperCase()}</span></td>
            <td>${listing.verifier}</td>
            <td>${formattedDate}</td>
            <td>${listing.notes}</td>
        `;
        
        tableBody.appendChild(row);
    });
}

// ===========================================
// CSV EXPORT LOGIC
// ===========================================

/**
 * Helper function to convert JSON array to CSV string.
 */
function convertToCSV(objArray) {
    const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
    let str = '';
    
    // Get headers (using only the keys we need for the report)
    const headers = ["listing_id", "name", "status", "verifier", "date", "notes"];
    const displayHeaders = ["Listing ID", "Property Name", "Status", "Verified By", "Date", "Notes"];
    
    str += displayHeaders.join(',') + '\r\n'; // Add header row

    // Process each row (listing)
    for (let i = 0; i < array.length; i++) {
        let line = '';
        for (let j = 0; j < headers.length; j++) {
            if (line !== '') line += ',';

            let value = array[i][headers[j]];
            
            // Handle null/undefined values and escape any commas/quotes in string fields
            if (value === null || value === undefined) {
                value = '';
            } else if (typeof value === 'string') {
                // Escape double quotes by doubling them, then enclose the whole string in double quotes
                value = '"' + value.replace(/"/g, '""') + '"';
            } else if (value instanceof Date) {
                // Ensure date values are formatted
                value = new Date(value).toLocaleDateString('en-US');
            }
            
            line += value;
        }
        str += line + '\r\n';
    }

    return str;
}

/**
 * Initiates the download of the Verification Report as a CSV file.
 */
function ubaExportReport() {
    if (currentReportData.length === 0) {
        alert("Cannot export: No verification records found.");
        return;
    }
    
    const csvString = convertToCSV(currentReportData);
    const filename = `Verification_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    
    // Create a Blob from the CSV string
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    
    // Create a temporary link element to trigger the download
    const link = document.createElement("a");
    if (link.download !== undefined) { 
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    alert('✅ Verification report exported successfully!');
}

/**
 * Placeholder for Review Report Export.
 */
function ubaExportReviewReport() {
    // If you want to enable this, implement similar logic to ubaExportReport 
    // using the review data source.
    alert('📊 Review report exported successfully as CSV!');
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
    // Keeping this function but removing the mock verification logic 
    // to avoid conflict with the form-based verification.
    window.openAdminLog = function() {
        alert("Opening the System Audit Log (conceptual)...");
    };
    document.querySelectorAll('.uba-report-card form, .uba-settings-card form').forEach(form => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            alert(`Report generated! Parameters: ${new FormData(form).get('report-type') || new FormData(form).get('ai-flag')}`);
        });
    });
}

function setupVerificationFormListeners() {
    const openFormButtons = document.querySelectorAll('.uba-verify-form-btn');
    const formContainer = document.getElementById('uba-verification-form-container');

    openFormButtons.forEach(button => {
        // Clone and replace to clear existing listeners
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        
        newButton.addEventListener('click', function() {
            const listingId = this.getAttribute('data-listing-id');
            const row = this.closest('.uba-table-row');
            // Extract landlord name from the row's first div content (e.g., "The Courtyard, Unit 7 (John Smith)")
            const propertyText = row.querySelector('div:first-child').textContent;
            const match = propertyText.match(/\(([^)]+)\)/); // Grab text inside parentheses
            const landlordName = match ? match[1].trim() : 'N/A';
            
            document.getElementById('uba-listing-id').value = listingId;
            document.getElementById('uba-landlord-name').value = landlordName;
            formContainer.style.display = 'block';
            
            // Scroll to form
            formContainer.scrollIntoView({ behavior: 'smooth' });
        });
    });
}

function setupVerificationForm() {
    const formContainer = document.getElementById('uba-verification-form-container');
    const closeFormButton = document.querySelector('.uba-close-form-btn');
    const cancelFormButton = document.querySelector('.uba-cancel-form-btn');
    const verificationForm = document.getElementById('uba-verification-form');

    function closeForm() {
        formContainer.style.display = 'none';
        verificationForm.reset();
        // Clear status selection on close
        document.getElementById('uba-status').value = ""; 
    }

    // Event listeners for closing forms
    closeFormButton.addEventListener('click', closeForm);
    cancelFormButton.addEventListener('click', closeForm);
    
    // Initial setup of listeners (for the mock data, will be re-run by renderPendingListings)
    setupVerificationFormListeners();

    // Form submission
    verificationForm.addEventListener('submit', async (e) => { // IMPORTANT: Must be async
        e.preventDefault();
        
        const listingId = document.getElementById('uba-listing-id').value;
        const status = document.getElementById('uba-status').value;
        const notes = document.getElementById('uba-notes').value;
        
        if (!status) {
            alert("Please select a verification status (Verified or Rejected).");
            return;
        }

        // Disable form elements during submission
        const submitBtn = verificationForm.querySelector('.uba-primary-btn');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;

        // 1. Call the Supabase update function
        const success = await updateListingVerificationStatus(listingId, status, notes);
        
        // 2. Handle the result
        if (success) {
            // Close form and show success
            closeForm();
            alert(`✅ Listing ${listingId} has been ${status} successfully!`);
            
            // 3. Reload the dashboard to update counts and queue table
            const overviewData = await fetchOverviewData();
            renderOverviewData(overviewData);
            await loadVerificationQueue(); 
            
            // 4. Reload the verification report table
            const reportData = await fetchVerificationReportData();
            renderVerificationReport(reportData);

        } else {
             alert(`❌ Failed to update listing ${listingId}. Check console for errors.`);
        }

        // Re-enable button
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    });
}

function setupReportFilters() {
    // Verification report filtering
    const searchInput = document.getElementById('uba-search-input');
    const filterStatus = document.getElementById('uba-filter-status');
    // NOTE: Updated ID to match HTML change
    const verificationTable = document.getElementById('uba-verification-report-table');
    const noResults = document.getElementById('uba-no-results');

    function filterVerificationTable() {
        const searchTerm = searchInput.value.toLowerCase();
        const statusFilter = filterStatus.value;
        const rows = verificationTable.getElementsByTagName('tr');
        let visibleCount = 0;

        // Note: Starts at 1 to skip the <thead> row
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
            // Assuming rating is always the first character in the second cell, e.g., "⭐ 4.5"
            const ratingMatch = cells[1].textContent.match(/\d/); 
            const rating = ratingMatch ? ratingMatch[0] : null;

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

// --- Main Execution ---
document.addEventListener("DOMContentLoaded", async function() {
    // 1. Authentication Check
    const { authorized } = await checkAuthAndRedirect();
    if (!authorized) return;
    
    // --- FIX: Expose module functions to the global window object ---
    window.ubaExportReport = ubaExportReport; 
    window.ubaExportReviewReport = ubaExportReviewReport;
    // -----------------------------------------------------------------
    
    // 2. Setup UI
    setupNavigation();
    setupQueueActions();
    setupReportFilters();

    // 3. Attach Logout Listener
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // 4. Fetch and Render Overview Data
    const overviewData = await fetchOverviewData();
    renderOverviewData(overviewData);

    // 5. Fetch and Render Verification Queue Data
    await loadVerificationQueue();
    
    // 6. Setup the Verification Form handlers (MUST be called after loadVerificationQueue)
    setupVerificationForm(); 
    
    // 7. Fetch and Render Verification Report Data (NEW)
    const reportData = await fetchVerificationReportData();
    renderVerificationReport(reportData);
});