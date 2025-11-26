
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://dquslrxlpmrersnjybym.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdXNscnhscG1yZXJzbmp5YnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNDg4NTYsImV4cCI6MjA3ODcyNDg1Nn0.ICkT2aVP_Ngr3Z24V2b9WLUxvcM-e6B84WkATqt94a8";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

let currentUserID = null;
let currentReportData = []; 
let currentReviewReportData = []; 


async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error("Logout Error:", error);
    }
    window.location.replace('/'); 
}
// Mobile navigation fixes
document.addEventListener('DOMContentLoaded', function() {
  // Add mobile logout button to Admin Dashboard
  const adminContent = document.querySelector('.uba-content-area');
  if (adminContent && !document.querySelector('.uba-logout-btn.mobile')) {
    const mobileLogoutBtn = document.createElement('button');
    mobileLogoutBtn.className = 'uba-logout-btn mobile';
    mobileLogoutBtn.textContent = 'Logout';
    mobileLogoutBtn.onclick = function() {
      // Add your logout logic here
      window.location.href = 'index.html';
    };
    document.querySelector('.uba-wrapper').appendChild(mobileLogoutBtn);
  }
  
  // Ensure tables are scrollable on mobile
  const makeTablesScrollable = function() {
    const tables = document.querySelectorAll('.uba-verification-table, .uba-verification-report-table-container, .uba-review-report-table-container, .landlord-listing-table');
    tables.forEach(table => {
      if (window.innerWidth <= 768) {
        table.style.overflowX = 'auto';
        table.style.display = 'block';
        table.style.width = '100%';
      } else {
        table.style.overflowX = '';
        table.style.display = '';
        table.style.width = '';
      }
    });
  };
  
  makeTablesScrollable();
  window.addEventListener('resize', makeTablesScrollable);
});

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
        await supabase.auth.signOut();
        window.location.replace('/'); 
        return { authorized: false };
    }
    
    currentUserID = user.user_id; 
    return { authorized: true };
}

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
    .eq('availability', true)
    .eq('verification_status', 'verified');

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


function renderOverviewData(data) {
    // Overview Stats
    document.getElementById('pending-verification-count').textContent = data.pendingVerificationCount;
    document.getElementById('active-listings-count').textContent = data.totalActiveListings;
    document.getElementById('landlord-count').textContent = data.totalLandlords;
    
    const totalPending = parseInt(data.pendingVerificationCount);
    const mockVerifiedCount = 5; 
    
    document.getElementById('verified-count').textContent = mockVerifiedCount; 
    document.getElementById('total-pending').textContent = totalPending; 

}

// ===========================================
// VERIFICATION QUEUE LOGIC
// ===========================================


async function updateListingVerificationStatus(listingId, status, notes) {
    const { data, error } = await supabase
        .from('listings')
        .update({ 
            verification_status: status, 
            feedback: notes,
            verified_by_id: currentUserID 
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

async function fetchPendingListings() {
    let { data: listings, error } = await supabase
        .from('listings')
        .select('*, landlord:users!listings_landlord_id_fkey(name)') 
        .eq('verification_status', 'pending')
        .order('created_at', { ascending: true });

    if (error) {
        console.error("Error fetching pending listings:", error.message);
        return [];
    }
    
    return listings.map(listing => ({
        listing_id: listing.listing_id,
        name: listing.name,
        landlord_name: listing.landlord ? listing.landlord.name : 'N/A',
        created_at: listing.created_at,
        verification_status: listing.verification_status
    }));
}


function renderPendingListings(listings) {
    const tableContainer = document.querySelector('.uba-verification-table');
    
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

    setupVerificationFormListeners();
}


async function loadVerificationQueue() {
    const pendingListings = await fetchPendingListings();
    renderPendingListings(pendingListings);
}

// ===========================================
// VERIFICATION REPORT LOGIC
// ===========================================

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


function renderVerificationReport(listings) {
    currentReportData = listings; 

    const tableBody = document.querySelector('#uba-verification-report-table tbody');
    if (!tableBody) return; 

    tableBody.innerHTML = ''; 
    
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
// REVIEW REPORT LOGIC (NEW)
// ===========================================

/**
 * Fetches listings with nested reviews and aggregates them.
 */
async function fetchReviewReportData() {
    // 1. Fetch listings and their associated reviews
    let { data: listings, error } = await supabase
        .from('listings')
        .select(`
            listing_id,
            name,
            reviews(rating, description, created_at)
        `)
        .not('reviews', 'is', null); // Only listings that have reviews

    if (error) {
        console.error("Error fetching review report data:", error.message);
        return [];
    }

    // 2. Client-side aggregation
    return listings.map(listing => {
        const reviews = listing.reviews || [];
        let totalRating = 0;
        let totalReviews = reviews.length;
        let latestReviewDescription = 'No comments yet.';

        if (totalReviews > 0) {
            reviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            latestReviewDescription = reviews[0].description || 'No comments yet.';
            
            totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
        }

        const avgRating = totalReviews > 0 ? (totalRating / totalReviews).toFixed(1) : 'N/A';
        const avgStars = totalReviews > 0 ? '⭐ ' + avgRating : 'N/A';

        return {
            listing_id: listing.listing_id,
            name: listing.name,
            avgRating: avgStars,
            totalReviews: totalReviews,
            commonFeedback: latestReviewDescription
        };
    }).filter(item => item.totalReviews > 0);
}

/**
 * Renders the aggregated review data into the Review Report table.
 */
function renderReviewReport(data) {
    currentReviewReportData = data; 

    const tableBody = document.querySelector('#uba-review-table tbody');
    if (!tableBody) return; 

    tableBody.innerHTML = ''; 
    
    if (data.length === 0) {
        document.getElementById('uba-review-no-results').style.display = 'block';
        return;
    }

    document.getElementById('uba-review-no-results').style.display = 'none';

    data.forEach(item => {
        const row = document.createElement('tr');
        row.setAttribute('data-rating', item.avgRating.replace('⭐ ', '').split('.')[0]);

        row.innerHTML = `
            <td>${item.name}</td>
            <td>${item.avgRating}</td>
            <td>${item.totalReviews}</td>
            <td>${item.commonFeedback}</td>
        `;
        
        tableBody.appendChild(row);
    });
}


// ===========================================
// CSV EXPORT LOGIC
// ===========================================

function convertToCSV(objArray, headers, displayHeaders) {
    const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
    let str = '';
    
    str += displayHeaders.join(',') + '\r\n';

    for (let i = 0; i < array.length; i++) {
        let line = '';
        for (let j = 0; j < headers.length; j++) {
            if (line !== '') line += ',';

            let value = array[i][headers[j]];
            
            if (value === null || value === undefined) {
                value = '';
            } else if (typeof value === 'string') {
                value = value.replace('⭐ ', ''); 
                value = '"' + value.replace(/"/g, '""') + '"';
            } else if (value instanceof Date) {
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
    
    const headers = ["listing_id", "name", "status", "verifier", "date", "notes"];
    const displayHeaders = ["Listing ID", "Property Name", "Status", "Verified By", "Date", "Notes"];
    
    const csvString = convertToCSV(currentReportData, headers, displayHeaders);
    const filename = `Verification_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    
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
 * Initiates the download of the Review Report as a CSV file.
 */
function ubaExportReviewReport() {
    if (currentReviewReportData.length === 0) {
        alert("Cannot export: No review records found.");
        return;
    }
    
    const headers = ["listing_id", "name", "avgRating", "totalReviews", "commonFeedback"];
    const displayHeaders = ["Listing ID", "Property Name", "Average Rating", "Total Reviews", "Latest Feedback"];
    
    const csvString = convertToCSV(currentReviewReportData, headers, displayHeaders);
    const filename = `Review_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    
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
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        
        newButton.addEventListener('click', function() {
            const listingId = this.getAttribute('data-listing-id');
            const row = this.closest('.uba-table-row');
            const propertyText = row.querySelector('div:first-child').textContent;
            const match = propertyText.match(/\(([^)]+)\)/);
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
    verificationForm.addEventListener('submit', async (e) => { 
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
            
            // 5. Reload review report (in case verification status affects visibility/reviews)
            const reviewData = await fetchReviewReportData();
            renderReviewReport(reviewData);

        } else {
             alert(`❌ Failed to update listing ${listingId}. Check console for errors.`);
        }

        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    });
}

function setupReportFilters() {
    // Verification report filtering
    const searchInput = document.getElementById('uba-search-input');
    const filterStatus = document.getElementById('uba-filter-status');
    const verificationTable = document.getElementById('uba-verification-report-table');
    const noResults = document.getElementById('uba-no-results');

    function filterVerificationTable() {
        const searchTerm = searchInput.value.toLowerCase();
        const statusFilter = filterStatus.value;
        const rows = verificationTable.getElementsByTagName('tr');
        let visibleCount = 0;

        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].getElementsByTagName('td');
            if (cells.length < 5) continue; 
            
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
            const row = rows[i];
            const cells = row.getElementsByTagName('td');
            
            if (cells.length < 4) continue;

            const propertyName = cells[0].textContent.toLowerCase();
            const rating = row.getAttribute('data-rating'); 

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
    
    // 7. Fetch and Render Verification Report Data
    const reportData = await fetchVerificationReportData();
    renderVerificationReport(reportData);

    // 8. Fetch and Render Review Report Data (NEW)
    const reviewData = await fetchReviewReportData();
    renderReviewReport(reviewData);
});