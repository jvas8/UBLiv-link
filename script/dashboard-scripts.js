import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Supabase Keys from your auth.js
const supabaseUrl = "https://dquslrxlpmrersnjybym.supabase.co"; 
const supabaseAnonKey = "sb_publishable_RH8RsvrsYFiEeWdF-7BBJA_Zc-RDCDm";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

let currentListingID = null; // To track the listing currently being edited
let recentActivityContainer = null; // <-- FIXED: Declared here in the outer scope

// --- NEW FUNCTION: Securely get the current authenticated user's ID ---
async function getCurrentLandlordId() {
    // Get the current user from Supabase Auth
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        console.error('User is not logged in.');
        return null;
    }
    
    // We assume the listings.landlord_id is linked to the Supabase auth.user().id
    return user.id; 
}

// dashboard-scripts.js (Place this function OUTSIDE of the DOMContentLoaded block)

function switchModule(targetId) {
    console.log(`[DEBUG] Switching module to: #${targetId}`); // Log
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
        console.error(`[ERROR] Module with ID #${targetId} not found in HTML.`); // Log Error
    }
}
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const navItems = document.querySelectorAll('.nav-item');
    const modules = document.querySelectorAll('.landlord-module');
    const listingsNav = document.getElementById('listings-nav');
    const backToListingsButton = document.getElementById('back-to-listings');
    const detailListingAddress = document.getElementById('detail-listing-address');
    
    // Containers for dynamic content
    const listingsTableContainer = document.getElementById('listings-table-container');
    const allFeedbackContainer = document.getElementById('all-feedback-container');
    const recentActivityContainer = document.getElementById('recent-activity-container'); // <-- THIS LINE IS ESSENTIAL

    if (!recentActivityContainer) {
        console.error("FATAL ERROR: The element with ID 'recent-activity-container' was not found. Please check landlordDASH.html.");
        return; // Stop script execution if the container is missing
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
    // dashboard-scripts.js (Inside DOMContentLoaded, after existing references)

    // --- NEW LISTING FORM ELEMENTS ---
    const newListingForm = document.getElementById('new-listing-form');
    const cancelNewListingBtn = document.getElementById('cancel-new-listing-btn');
    const newListingMessage = document.getElementById('new-listing-message');
    // ---------------------------------


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
        
        // FETCH FIX: Including a join on 'reviews' to calculate stats directly
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

        document.getElementById('overview-stat-active-listings').textContent = activeListings;
        document.getElementById('overview-stat-total-reviews').textContent = totalReviews;
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

        // Fetch top 5 most recent reviews for listings owned by this landlord
        // SCHEMA FIX: Use 'description' and join 'listings(name)'
        const { data: reviews, error } = await supabase
            .from('reviews')
            .select('rating, description, created_at, listings(name, landlord_id)')
            .eq('listings.landlord_id', landlordId) // Filter by landlord ID using the joined table
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
                    <p class="activity-excerpt">"${review.description.substring(0, 80)}..."</p>
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
                            <button class="action-btn view-stats-btn" title="View Listing Statistics">
                                <i class="fas fa-chart-bar"></i> Stats
                            </button>
                            <button class="action-btn edit edit-listing-btn" title="Edit Listing Details">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        `;

        listingsTableContainer.innerHTML = tableHTML;
        attachViewStatsListeners(); 
        attachEditListeners(); 
    }

    async function renderListingDetails(listingID, listingName) {
        // Fetch listing details and bedrooms/description
        const { data: listing, error: listingError } = await supabase
            .from('listings')
            .select('name, price, property_details(description, bedrooms)') 
            .eq('listing_id', listingID)
            .single();

        // Fetch reviews 
        const { data: reviews, error: reviewError } = await supabase
            .from('reviews')
            .select('rating, description, user_id, created_at')
            .eq('listing_id', listingID)
            .order('created_at', { ascending: false })
            .limit(5);

        if (listingError) {
            console.error('Error fetching listing details:', listingError);
            switchModule('listings');
            return;
        }

        // Calculate average rating and total reviews for this listing
        const reviewsCount = reviews ? reviews.length : 0;
        const totalRating = reviews ? reviews.reduce((sum, r) => sum + r.rating, 0) : 0;
        const avgRating = reviewsCount > 0 ? (totalRating / reviewsCount).toFixed(1) : 'N/A';

        // Update Details Module DOM
        document.getElementById('detail-listing-address').textContent = `Listing Details: ${listingName}`;
        
        // Update stats cards
        document.getElementById('detail-stat-contact-rate').textContent = 'N/A'; 
        document.getElementById('detail-stat-avg-rating').textContent = avgRating; 
        document.getElementById('detail-stat-price').textContent = `$${listing.price}`;
        
        // Render Reviews Section
        const totalReviewCountSpan = document.getElementById('total-review-count');
        totalReviewCountSpan.textContent = reviewsCount; 

        renderRatingDistribution(reviews);
        renderRecentReviews(reviews);
        
        switchModule('listing-details');
    }

    function renderRatingDistribution(reviews) {
        const container = document.getElementById('rating-distribution-container');
        container.innerHTML = '';
        
        if (!reviews || reviews.length === 0) {
            container.innerHTML = '<p>No reviews yet.</p>';
            return;
        }

        const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        reviews.forEach(review => {
            const rating = Math.round(review.rating); 
            if (counts.hasOwnProperty(rating)) {
                counts[rating]++;
            }
        });

        const total = reviews.length;

        for (let rating = 5; rating >= 1; rating--) {
            const count = counts[rating];
            const percentage = total > 0 ? (count / total) * 100 : 0;
            
            const barHTML = `
                <div class="rating-bar-container">
                    <div class="rating-label">${rating}★</div>
                    <div class="rating-bar">
                        <div class="rating-fill" style="width: ${percentage.toFixed(0)}%;"></div>
                    </div>
                    <div class="rating-count">${count}</div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', barHTML);
        }
    }

    function renderRecentReviews(reviews) {
        const container = document.getElementById('recent-reviews-container');
        container.innerHTML = '';

        if (!reviews || reviews.length === 0) {
            container.innerHTML = '<p>No recent reviews to display.</p>';
            return;
        }

        reviews.forEach(review => {
            // SCHEMA FIX: Using 'user_id' for reviewer and 'description' for content
            const reviewerDisplay = review.user_id ? `User ID: ${review.user_id.substring(0, 8)}...` : 'Anonymous';
            const metaText = `${review.rating}/5 | ${reviewerDisplay} - ${new Date(review.created_at).toLocaleDateString()}`;
            
            const reviewHTML = `
                <div class="review-card">
                    <p class="review-meta">${metaText}</p>
                    <p class="review-text">"${review.description || 'No comment provided.'}"</p>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', reviewHTML);
        });
    }

    async function getAllFeedback() {
        const landlordId = await getCurrentLandlordId();
        if (!landlordId) {
            allFeedbackContainer.innerHTML = '<p class="error-message">Cannot load feedback: User not logged in.</p>';
            return;
        }

        // Fetch all reviews for listings owned by this landlord
        // SCHEMA FIX: Selecting 'description' and joining 'listings(name)' and filtering by landlord_id
        const { data: reviews, error } = await supabase
            .from('reviews')
            .select('listing_id, rating, description, created_at, user_id, listings(name, landlord_id)')
            .eq('listings.landlord_id', landlordId) // Filter by landlord ID using the joined table
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
            // SCHEMA FIX: Using 'description' and 'user_id'
            const reviewerDisplay = review.user_id ? `User ID: ${review.user_id.substring(0, 8)}...` : 'Anonymous';

            const feedbackCardHTML = `
                <div class="feedback-card">
                    <div class="feedback-header">
                        <div class="feedback-rating">${ratingText} (${review.rating}/5)</div>
                        <div class="feedback-date">${date}</div>
                    </div>
                    <p class="feedback-listing">
                        Listing: <a href="#listing-details" class="listing-link" data-listing-id="${review.listing_id}">
                            ${review.listings.name || 'Unknown Address'}
                        </a>
                    </p>
                    <p class="feedback-content">"${review.description || 'No comment provided.'}"</p>
                    <p class="feedback-meta">Reviewed by: ${reviewerDisplay}</p>
                </div>
            `;
            allFeedbackContainer.insertAdjacentHTML('beforeend', feedbackCardHTML);
        });

        // Add listeners to the dynamic listing links
        document.querySelectorAll('.listing-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const listingID = e.currentTarget.dataset.listingId;
                const listingName = e.currentTarget.textContent.trim();
                setActiveNav(listingsNav); 
                renderListingDetails(listingID, listingName); 
            });
        });
    }
    
    // --- Listing Edit Functions (Kept for completeness) ---

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
    // dashboard-scripts.js (After handleEditListingSubmit or similar functions)

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
        // Using the 'name' attribute from the HTML (e.g., name="address")
        const address = form.address.value; 
        const propertyType = form.propertyType.value;
        const bedrooms = parseInt(form.bedrooms.value, 10);
        const price = parseFloat(form.rentPrice.value);
        const leaseTerm = form.leaseTerm.value;
        const description = form.description.value;
        // const photos = form.photos.files; // Stored for later photo logic

        // 2. Insert into 'listings' table (The address serves as both 'name' and 'location')
        const { data: listingData, error: listingError } = await supabase
            .from('listings')
            .insert({
                landlord_id: landlordId,
                name: address,      // Address used for listing name
                location: address,  // Address used for location
                price: price,
                leasing: leaseTerm,
                // availability defaults to true and verification_status to 'pending'
            })
            .select('listing_id') // Request the generated ID back
            .single();

        if (listingError) {
            console.error('Error creating new listing:', listingError);
            newListingMessage.textContent = `Error creating listing: ${listingError.message}`;
            newListingMessage.classList.add('error');
            return;
        }

        const newListingId = listingData.listing_id;

        // 3. Insert into 'property_details' table using the new listing_id
        const { error: detailsError } = await supabase
            .from('property_details')
            .insert({
                listing_id: newListingId,
                property_type: propertyType,
                bedrooms: bedrooms,
                description: description
            });
            
        if (detailsError) {
            console.error('Error adding property details:', detailsError);
            // Inform the user, but the core listing is still technically created
            newListingMessage.textContent = `Listing created, but failed to add details: ${detailsError.message}`;
            newListingMessage.classList.add('error');
        } else {
            newListingMessage.textContent = 'Listing published successfully!';
            newListingMessage.classList.add('success');

            // 4. Navigate back to listings after success
            setTimeout(() => {
                form.reset(); // Clear the form
                switchModule('listings');
                getLandlordListings();
            }, 2000);
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

    // 2. View Stats Click (Goes to Listing Details) and Edit Click (attached dynamically)
    function attachViewStatsListeners() {
        const viewStatsButtons = document.querySelectorAll('.view-stats-btn');
        viewStatsButtons.forEach(btn => {
            btn.removeEventListener('click', handleViewStatsClick);
            btn.addEventListener('click', handleViewStatsClick); 
        });
    }

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

    function handleViewStatsClick(e) {
        e.preventDefault(); 
        const row = e.target.closest('.table-row');
        const listingID = row.dataset.listingId;
        const listingName = row.querySelector('div').textContent.trim();
        
        renderListingDetails(listingID, listingName);
        setActiveNav(listingsNav); 
    }
    
    // 3. Back Button Click (Goes back to Listings Summary)
    backToListingsButton.addEventListener('click', () => {
        switchModule('listings');
        setActiveNav(listingsNav);
    });
    
    // 4. Form Submit Listener 
    editForm.addEventListener('submit', handleEditListingSubmit);

    // 5. Cancel Button Listener
    cancelEditBtn.addEventListener('click', (e) => {
        e.preventDefault();
        switchModule('listings');
        setActiveNav(listingsNav);
    });
    
// The function called by the sidebar button
    window.openListingForm = function() {
        console.log("[DEBUG] 'Add New Listing' button clicked. Initiating switch."); // Log
        switchModule('add-listing'); 
        
        if (newListingMessage) {
            newListingMessage.textContent = ''; // Clear previous messages
        }
    };
    // 4. Form Submit Listener for NEW LISTING FORM
    if (newListingForm) {
        newListingForm.addEventListener('submit', handleNewListingSubmit);
    }

    // 5. Cancel Button Listener for NEW LISTING FORM
    if (cancelNewListingBtn) {
        cancelNewListingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchModule('listings'); // Go back to the listings table
            getLandlordListings();
        });
    }
    
    // --- Initial Load ---
    getLandlordListings();
});