import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Supabase Keys from your auth.js
const supabaseUrl = "https://dquslrxlpmrersnjybym.supabase.co"; 
const supabaseAnonKey = "sb_publishable_RH8RsvrsYFiEeWdF-7BBJA_Zc-RDCDm";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

let currentListingID = null; // To track the listing currently being edited

// --- UPDATED FUNCTION: Get the proper landlord user_id ---
async function getCurrentLandlordId() {
    // Get the current user from Supabase Auth
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        console.error('User is not logged in.');
        return null;
    }
    
    // Get the user_id from your users table that matches the auth_id
    const { data: userRecord, error } = await supabase
        .from('users')
        .select('user_id, role')
        .eq('auth_id', user.id)
        .single();

    if (error) {
        console.error('Error fetching user record:', error);
        return null;
    }

    if (!userRecord || userRecord.role !== 'landlord') {
        console.error('User is not a landlord or not found in users table.');
        return null;
    }
    
    return userRecord.user_id; // This is what should go in listings.landlord_id
}

function switchModule(targetId) {
    console.log(`[DEBUG] Switching module to: #${targetId}`);
    const modules = document.querySelectorAll('.landlord-module');
    
    // 1. Hide all modules
    modules.forEach(module => {
        module.classList.remove('active');
    });

    // 2. Show the target module
    const targetModule = document.getElementById(targetId);
    if (targetModule) {
        targetModule.classList.add('active');
        console.log(`[DEBUG] Successfully activated module: #${targetId}`);
    } else {
        console.error(`[ERROR] Module with ID #${targetId} not found in HTML.`);
    }
}

async function handleLogout() {
    console.log('[DEBUG] Logout button clicked.');
    const { error } = await supabase.auth.signOut();

    if (error) {
        console.error('Error logging out:', error.message);
        alert('Could not log out. Please try again.');
    } else {
        // Redirect the user to the login page or homepage after successful logout
        console.log('Successfully logged out. Redirecting...');
        window.location.href = 'index.html'; 
    }
}

// Function to open the add listing form
function openListingForm() {
    console.log("[DEBUG] 'Add New Listing' button clicked. Initiating switch.");
    switchModule('add-listing'); 
    
    const newListingMessage = document.getElementById('new-listing-message');
    if (newListingMessage) {
        newListingMessage.textContent = ''; // Clear previous messages
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const navItems = document.querySelectorAll('.nav-item');
    const listingsNav = document.getElementById('listings-nav');
    const logoutBtn = document.getElementById('logout-btn');
    const addListingBtn = document.getElementById('add-listing-btn'); // NEW: Add listing button

    // Containers for dynamic content
    const listingsTableContainer = document.getElementById('listings-table-container');
    const allFeedbackContainer = document.getElementById('all-feedback-container');
    const recentActivityContainer = document.getElementById('recent-activity-container');

    if (!recentActivityContainer) {
        console.error("FATAL ERROR: The element with ID 'recent-activity-container' was not found.");
        return;
    }

    // Listing Edit Form Elements
    const editForm = document.getElementById('edit-listing-form');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const editMessage = document.getElementById('edit-message');

    // Listing Edit Form Fields
    const editAddress = document.getElementById('edit-address');
    const editPrice = document.getElementById('edit-price');
    const editBedrooms = document.getElementById('edit-bedrooms');
    const editDescription = document.getElementById('edit-description');
    const editAvailability = document.getElementById('edit-availability');
    
    // --- NEW LISTING FORM ELEMENTS ---
    const newListingForm = document.getElementById('new-listing-form');
    const cancelNewListingBtn = document.getElementById('cancel-new-listing-btn');
    const newListingMessage = document.getElementById('new-listing-message');
    // ---------------------------------

    // --- Event Listeners ---
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // NEW: Add listing button event listener
    if (addListingBtn) {
        addListingBtn.addEventListener('click', openListingForm);
    }

    // --- Core UI Functions ---
    function setActiveNav(element) {
        navItems.forEach(nav => nav.classList.remove('active'));
        if (element) {
            element.classList.add('active');
        }
    }

    // --- Data Fetching and Rendering Functions ---
    async function getLandlordListings() {
        const landlordId = await getCurrentLandlordId();

        if (!landlordId) {
            listingsTableContainer.innerHTML = `<p class="error-message">You must be logged in to view listings.</p>`;
            document.getElementById('overview-stat-active-listings').textContent = 'N/A';
            return [];
        }
        
        const { data: listings, error } = await supabase
            .from('listings')
            .select('listing_id, name, price, availability, property_details(bedrooms), reviews(rating)')
            .eq('landlord_id', landlordId);

        if (error) {
            console.error('Error fetching listings:', error);
            listingsTableContainer.innerHTML = `<p class="error-message">Error loading listings: ${error.message}</p>`;
            return [];
        }

        // Calculate stats for each listing
        const listingsWithStats = listings.map(listing => {
            const totalReviews = listing.reviews.length;
            const avgRating = totalReviews > 0 
                ? (listing.reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1) 
                : null;
            return {
                ...listing,
                totalReviews,
                avgRating: avgRating // null if no reviews
            };
        });

        renderListingsTable(listingsWithStats);
        updateOverviewStats(listingsWithStats);
        return listingsWithStats;
    }

    function updateOverviewStats(listings) {
        const activeListings = listings.filter(l => l.availability).length; 
        
        const allReviews = listings.flatMap(l => l.reviews || []);
        const totalReviews = allReviews.length;
        
        const avgRating = totalReviews > 0 
            ? (allReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1) 
            : 'N/A';

        // FIXED: Using correct element IDs
        document.getElementById('overview-stat-active-listings').textContent = activeListings;
        document.getElementById('overview-stat-avg-rating').textContent = avgRating;
        
        // Load recent activity after stats are calculated
        renderRecentActivity();
    }
    
    // --- NEW FUNCTION: Render Recent Activity on Overview Page ---
    async function renderRecentActivity() {
        const landlordId = await getCurrentLandlordId();
        recentActivityContainer.innerHTML = '<p>Loading recent activity...</p>';
        
        if (!landlordId) {
            recentActivityContainer.innerHTML = '<p class="error-message">Cannot load activity: User not logged in.</p>';
            return;
        }

        const { data: reviews, error } = await supabase
            .from('reviews')
            .select('rating, description, created_at, listings(name, landlord_id)')
            .eq('listings.landlord_id', landlordId)
            .order('created_at', { ascending: false })
            .limit(5);

        if (error) {
            console.error('Error fetching recent activity:', error);
            recentActivityContainer.innerHTML = `<p class="error-message">Error loading recent activity: ${error.message}</p>`;
            return;
        }

        if (!reviews || reviews.length === 0) {
            recentActivityContainer.innerHTML = '<p>No recent activity to display.</p>';
            return;
        }

        const activityHTML = reviews.map(review => {
            const date = new Date(review.created_at).toLocaleDateString();
            const ratingText = '★'.repeat(Math.round(review.rating));
            const address = review.listings.name || 'Unknown Address';

            return `
                <div class="recent-activity-card">
                    <div class="activity-header">
                        <span class="activity-rating">${ratingText} (${review.rating}/5)</span>
                        <span class="activity-date">${date}</span>
                    </div>
                    <p class="activity-listing">
                        Listing: <strong>${address}</strong>
                    </p>
                    <p class="activity-excerpt">"${review.description ? review.description.substring(0, 80) + '...' : 'No description'}"</p>
                </div>
            `;
        }).join('');

        recentActivityContainer.innerHTML = activityHTML;
    }

    function renderListingsTable(listings) {
        listingsTableContainer.innerHTML = ''; 

        if (!listings || listings.length === 0) {
            listingsTableContainer.innerHTML = '<p>You have no current property listings.</p>';
            return;
        }

        const tableHTML = `
            <div class="table-header table-row">
                <div>Address</div>
                <div>Price</div>
                <div>Beds</div>
                <div>Rating</div>
                <div>Status</div>
                <div>Actions</div>
            </div>
            ${listings.map(listing => {
                const bedrooms = listing.property_details ? listing.property_details.bedrooms : 'N/A';
                const status = listing.availability ? 'Active' : 'Inactive';
                const statusClass = listing.availability ? 'status-active' : 'status-inactive';
                
                const ratingDisplay = listing.avgRating ? `${listing.avgRating}/5` : 'N/A'; 

                return `
                    <div class="table-row" data-listing-id="${listing.listing_id}">
                        <div>${listing.name}</div>
                        <div>$${listing.price}</div>
                        <div>${bedrooms}</div>
                        <div>${ratingDisplay}</div>
                        <div class="${statusClass}">
                            ${status}
                        </div>
                        <div class="actions">
                            <button class="action-btn edit edit-listing-btn" title="Edit Listing Details">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        `;

        listingsTableContainer.innerHTML = tableHTML;
        attachEditListeners(); 
    }

    async function getAllFeedback() {
        const landlordId = await getCurrentLandlordId();
        if (!landlordId) {
            allFeedbackContainer.innerHTML = '<p class="error-message">Cannot load feedback: User not logged in.</p>';
            return;
        }

        const { data: reviews, error } = await supabase
            .from('reviews')
            .select('listing_id, rating, description, created_at, user_id, listings(name, landlord_id)')
            .eq('listings.landlord_id', landlordId)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error fetching all feedback:', error);
            allFeedbackContainer.innerHTML = `<p class="error-message">Error loading feedback: ${error.message}</p>`;
            return;
        }

        renderAllFeedback(reviews);
    }

    function renderAllFeedback(reviews) {
        allFeedbackContainer.innerHTML = '';

        if (!reviews || reviews.length === 0) {
            allFeedbackContainer.innerHTML = '<p>No feedback has been submitted yet.</p>';
            return;
        }

        reviews.forEach(review => {
            const date = new Date(review.created_at).toLocaleDateString();
            const ratingText = '★'.repeat(Math.round(review.rating));
            const reviewerDisplay = review.user_id ? `User ID: ${review.user_id.substring(0, 8)}...` : 'Anonymous';

            const feedbackCardHTML = `
                <div class="feedback-card">
                    <div class="feedback-header">
                        <div class="feedback-rating">${ratingText} (${review.rating}/5)</div>
                        <div class="feedback-date">${date}</div>
                    </div>
                    <p class="feedback-listing">
                        Listing: ${review.listings.name || 'Unknown Address'}
                    </p>
                    <p class="feedback-content">"${review.description || 'No comment provided.'}"</p>
                    <p class="feedback-meta">Reviewed by: ${reviewerDisplay}</p>
                </div>
            `;
            allFeedbackContainer.insertAdjacentHTML('beforeend', feedbackCardHTML);
        });
    }
    
    // --- Listing Edit Functions ---
    async function openEditListingForm(listingID) {
        currentListingID = listingID;
        editMessage.textContent = ''; 
        
        const { data: listing, error } = await supabase
            .from('listings')
            .select('name, price, availability, property_details(bedrooms, description)')
            .eq('listing_id', listingID)
            .single();

        if (error) {
            console.error('Error fetching listing for edit:', error);
            editMessage.textContent = 'Error loading listing data.';
            return;
        }

        editAddress.value = listing.name; 
        editPrice.value = listing.price;
        editBedrooms.value = listing.property_details ? listing.property_details.bedrooms : '';
        editDescription.value = listing.property_details ? listing.property_details.description || '' : '';
        editAvailability.value = listing.availability.toString(); 
        
        switchModule('edit-listing');
    }

    async function handleEditListingSubmit(e) {
        e.preventDefault();
        
        if (!currentListingID) {
            editMessage.textContent = 'Error: No listing ID selected.';
            return;
        }

        editMessage.textContent = 'Saving changes...';
        editMessage.classList.remove('error', 'success');

        const listingUpdateData = {
            name: editAddress.value, 
            price: parseInt(editPrice.value, 10),
            availability: editAvailability.value === 'true' 
        };

        const propertyDetailsUpdateData = {
            bedrooms: parseInt(editBedrooms.value, 10),
            description: editDescription.value,
        };

        const { error: listingError } = await supabase
            .from('listings')
            .update(listingUpdateData)
            .eq('listing_id', currentListingID); 

        if (listingError) {
            console.error('Error updating listing details:', listingError);
            editMessage.textContent = `Error updating listing details: ${listingError.message}`;
            editMessage.classList.add('error');
            return;
        }

        const { error: detailsError } = await supabase
            .from('property_details')
            .update(propertyDetailsUpdateData)
            .eq('listing_id', currentListingID); 

        if (detailsError) {
            console.error('Error updating property details:', detailsError);
            editMessage.textContent = `Listing details updated, but error updating property specs: ${detailsError.message}`;
            editMessage.classList.add('error');
            return;
        }
        
        editMessage.textContent = 'Listing updated successfully!';
        editMessage.classList.add('success');
        
        setTimeout(() => {
            switchModule('listings');
            getLandlordListings();
        }, 1500);
    }

    // --- NEW FUNCTION: Handle New Listing Submission ---
    async function handleNewListingSubmit(e) {
        e.preventDefault();
        newListingMessage.textContent = 'Publishing listing...';
        newListingMessage.classList.remove('error', 'success');

        const landlordId = await getCurrentLandlordId();
        if (!landlordId) {
            newListingMessage.textContent = 'Error: You must be logged in to post a listing.';
            newListingMessage.classList.add('error');
            return;
        }

        // 1. Collect Data from the Form
        const form = e.target;
        const address = form.address.value; 
        const propertyType = form.propertyType.value;
        const bedrooms = parseInt(form.bedrooms.value, 10);
        const price = parseFloat(form.price.value);
        const leaseTerm = form.leaseTerm.value;
        const description = form.description.value;

        try {
            // 2. Insert into 'listings' table
            const { data: listingData, error: listingError } = await supabase
                .from('listings')
                .insert({
                    landlord_id: landlordId,
                    name: address,
                    location: address,
                    price: price,
                    leasing: leaseTerm,
                    availability: true,
                    verification_status: 'pending'
                })
                .select('listing_id')
                .single();

            if (listingError) throw listingError;

            const newListingId = listingData.listing_id;

            // 3. Insert into 'property_details' table
            const { error: detailsError } = await supabase
                .from('property_details')
                .insert({
                    listing_id: newListingId,
                    property_type: propertyType,
                    bedrooms: bedrooms,
                    description: description
                });
                
            if (detailsError) throw detailsError;

            newListingMessage.textContent = 'Listing published successfully!';
            newListingMessage.classList.add('success');

            // 4. Navigate back to listings after success
            setTimeout(() => {
                form.reset();
                switchModule('listings');
                getLandlordListings();
            }, 2000);

        } catch (error) {
            console.error('Error creating new listing:', error);
            newListingMessage.textContent = `Error creating listing: ${error.message}`;
            newListingMessage.classList.add('error');
        }
    }

    // --- Event Listeners ---

    // 1. Navigation Clicks
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            const targetId = e.currentTarget.getAttribute('href').substring(1);
            setActiveNav(e.currentTarget);
            switchModule(targetId);

            if (targetId === 'listings' || targetId === 'overview') {
                getLandlordListings();
            } else if (targetId === 'feedback') {
                getAllFeedback();
            }
        });
    });

    function attachEditListeners() {
        const editButtons = document.querySelectorAll('.edit-listing-btn');
        editButtons.forEach(editBtn => {
            editBtn.removeEventListener('click', handleEditClickGeneral);
            editBtn.addEventListener('click', handleEditClickGeneral);
        });
    }
    
    function handleEditClickGeneral(e) {
        e.preventDefault();
        const row = e.target.closest('.table-row');
        const listingID = row.dataset.listingId;
        openEditListingForm(listingID);
    }
    
    // 2. Form Submit Listener 
    if (editForm) {
        editForm.addEventListener('submit', handleEditListingSubmit);
    }

    // 3. Cancel Button Listener
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchModule('listings');
            setActiveNav(listingsNav);
        });
    }
    
    // 4. Form Submit Listener for NEW LISTING FORM
    if (newListingForm) {
        newListingForm.addEventListener('submit', handleNewListingSubmit);
    }

    // 5. Cancel Button Listener for NEW LISTING FORM
    if (cancelNewListingBtn) {
        cancelNewListingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchModule('listings');
            getLandlordListings();
        });
    }
    
    // --- Initial Load ---
    getLandlordListings();
});