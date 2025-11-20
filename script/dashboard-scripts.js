import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Supabase Keys from your auth.js
const supabaseUrl = "https://dquslrxlpmrersnjybym.supabase.co"; 
const supabaseAnonKey = "sb_publishable_RH8RsvrsYFiEeWdF-7BBJA_Zc-RDCDm";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

let currentListingID = null; // To track the listing currently being edited

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
    const statsGridContainer = document.getElementById('stats-grid-container'); // For Overview stats

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


    // --- Core UI Functions ---

    function switchModule(targetId) {
        // Deactivate all modules
        modules.forEach(mod => mod.classList.remove('active'));

        // Show the target module
        const targetModule = document.getElementById(targetId);
        if (targetModule) {
            targetModule.classList.add('active');
        }
    }
    
    function setActiveNav(element) {
        navItems.forEach(nav => nav.classList.remove('active'));
        if (element) {
            element.classList.add('active');
        }
    }

    // --- Data Fetching and Rendering Functions ---

    async function getLandlordListings() {
        // 1. Get the current landlord's ID
        const landlordId = await getCurrentLandlordId();

        if (!landlordId) {
            // Display a message if the user is not logged in or ID is missing
            listingsTableContainer.innerHTML = `<p class="error-message">You must be logged in to view listings.</p>`;
            document.getElementById('overview-stat-active-listings').textContent = 'N/A';
            return [];
        }
        
        // FETCH FIX: Using correct columns and filtering by the landlord_id
        const { data: listings, error } = await supabase
            .from('listings')
            .select('listing_id, name, price, availability, property_details(bedrooms)')
            .eq('landlord_id', landlordId); // <--- CRITICAL FILTER

        if (error) {
            console.error('Error fetching listings:', error);
            listingsTableContainer.innerHTML = `<p class="error-message">Error loading listings: ${error.message}</p>`;
            return [];
        }

        renderListingsTable(listings);
        updateOverviewStats(listings);
        return listings;
    }

    function updateOverviewStats(listings) {
        // Using 'availability' instead of 'is_available'
        const activeListings = listings.filter(l => l.availability).length; 
        
        // NOTE: total_reviews and avg_rating are NOT in your listings table, 
        // so these stats will currently display placeholder data or N/A.
        const totalReviews = 0; // listings.reduce((sum, l) => sum + (l.total_reviews || 0), 0);
        const avgRating = 'N/A'; // listings.length > 0 ? (listings.reduce((sum, l) => sum + (l.avg_rating || 0), 0) / listings.length).toFixed(1) : 'N/A';

        document.getElementById('overview-stat-active-listings').textContent = activeListings;
        document.getElementById('overview-stat-total-reviews').textContent = totalReviews;
        document.getElementById('overview-stat-avg-rating').textContent = avgRating;
    }


    function renderListingsTable(listings) {
        listingsTableContainer.innerHTML = ''; // Clear previous content

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
                // RENDER FIX: Using listing_id, name, availability, and accessing bedrooms via property_details
                const bedrooms = listing.property_details ? listing.property_details.bedrooms : 'N/A';
                const status = listing.availability ? 'Active' : 'Inactive';
                const statusClass = listing.availability ? 'status-active' : 'status-inactive';
                
                // NOTE: avg_rating and total_reviews are still missing
                const ratingDisplay = 'N/A'; 

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
                            <button class="btn-secondary btn-small view-stats-btn">View Stats</button>
                            <button class="btn-primary btn-small edit-listing-btn">Edit</button>
                        </div>
                    </div>
                `;
            }).join('')}
        `;

        listingsTableContainer.innerHTML = tableHTML;
        attachViewStatsListeners(); // Re-attach listeners for dynamically created buttons
        attachEditListeners(); // Re-attach listeners for dynamically created buttons
    }

    async function renderListingDetails(listingID, listingName) {
        // FETCH FIX: Use listing_id, name, and join property_details for description/bedrooms
        // Removed references to contact_rate, avg_rating, total_reviews
        const { data: listing, error: listingError } = await supabase
            .from('listings')
            .select('name, price, property_details(description, bedrooms)') 
            .eq('listing_id', listingID)
            .single();

        // Fetch reviews (Reviews table assumed to exist and have listing_id)
        const { data: reviews, error: reviewError } = await supabase
            .from('reviews')
            .select('rating, content, reviewer_name')
            .eq('listing_id', listingID)
            .order('created_at', { ascending: false })
            .limit(5);

        if (listingError) {
            console.error('Error fetching listing details:', listingError);
            switchModule('listings');
            return;
        }

        if (reviewError) {
            console.warn('Error fetching listing reviews, showing only listing data:', reviewError);
        }

        // Update Details Module DOM
        document.getElementById('detail-listing-address').textContent = listingName;
        // STATS FIX: Replaced missing stats with N/A or temporary placeholders
        document.getElementById('detail-stat-contact-rate').textContent = 'N/A'; // contact_rate removed from schema
        document.getElementById('detail-stat-avg-rating').textContent = 'N/A / 5'; // avg_rating removed from schema
        document.getElementById('detail-stat-price').textContent = `$${listing.price}`;
        // DESCRIPTION FIX: Accessing description from the joined property_details table
        // NOTE: The element with id='listing-description' is NOT in the HTML file provided, 
        // so this line might cause an error unless you add it to the 'listing-details' section.
        // document.getElementById('listing-description').textContent = description; 
        
        
        // Render Reviews Section
        const totalReviewCountSpan = document.getElementById('total-review-count');
        totalReviewCountSpan.textContent = reviews ? reviews.length : 0; // Using fetched review count for total

        renderRatingDistribution(reviews);
        renderRecentReviews(reviews);
        
        // Switch to the Listing Details module
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
            const rating = Math.round(review.rating); // Ensure integer rating
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
            const metaText = `${review.rating}/5 | ${review.reviewer_name || 'Anonymous'}`;
            const reviewHTML = `
                <div class="review-card">
                    <p class="review-meta">${metaText}</p>
                    <p class="review-text">"${review.content || 'No comment provided.'}"</p>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', reviewHTML);
        });
    }

    async function getAllFeedback() {
        // FEEDBACK FIX: Use listing_id and name
        // NOTE: This function still pulls ALL feedback from the DB. 
        // If you want to limit feedback to only the landlord's listings, 
        // you would need to fetch the landlord's IDs first and use an `.in('listing_id', [...ids])` filter.
        const { data: reviews, error } = await supabase
            .from('reviews')
            .select('listing_id, rating, content, created_at, reviewer_name, listings(name)')
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
                    <p class="feedback-content">"${review.content || 'No comment provided.'}"</p>
                    <p class="feedback-meta">Reviewed by: ${review.reviewer_name || 'Anonymous'}</p>
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
                setActiveNav(listingsNav); // Visually activate Listings tab
                renderListingDetails(listingID, listingName); // Render the details
            });
        });
    }
    
    // --- Listing Edit Functions ---

    async function openEditListingForm(listingID) {
        currentListingID = listingID;
        editMessage.textContent = ''; // Clear previous messages
        
        // FETCH FIX: Use listing_id, name, availability, and join property_details for bedrooms/description
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

        // Populate the form fields
        editAddress.value = listing.name; // Use 'name' instead of 'address'
        editPrice.value = listing.price;
        // FIELD FIX: Accessing bedrooms and description from the joined property_details table
        editBedrooms.value = listing.property_details ? listing.property_details.bedrooms : '';
        editDescription.value = listing.property_details ? listing.property_details.description || '' : '';
        editAvailability.value = listing.availability.toString(); // Use 'availability' instead of 'is_available'
        
        // Switch to the edit module
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

        // --- Prepare Data ---
        // Data for the 'listings' table
        const listingUpdateData = {
            name: editAddress.value, // Use 'name'
            price: parseInt(editPrice.value, 10),
            availability: editAvailability.value === 'true' // Use 'availability'
        };

        // Data for the 'property_details' table
        const propertyDetailsUpdateData = {
            bedrooms: parseInt(editBedrooms.value, 10),
            description: editDescription.value,
        };


        // --- Update LISTINGS Table ---
        const { error: listingError } = await supabase
            .from('listings')
            .update(listingUpdateData)
            .eq('listing_id', currentListingID); // Use 'listing_id'

        if (listingError) {
            console.error('Error updating listing details:', listingError);
            editMessage.textContent = `Error updating listing details: ${listingError.message}`;
            editMessage.classList.add('error');
            return;
        }

        // --- Update PROPERTY_DETAILS Table ---
        const { error: detailsError } = await supabase
            .from('property_details')
            .update(propertyDetailsUpdateData)
            .eq('listing_id', currentListingID); // Use 'listing_id'

        if (detailsError) {
            console.error('Error updating property details:', detailsError);
            // Show success for listing but warn about property details failure
            editMessage.textContent = `Listing details updated, but error updating property specs: ${detailsError.message}`;
            editMessage.classList.add('error');
            return;
        }
        
        // --- Success ---
        editMessage.textContent = 'Listing updated successfully!';
        editMessage.classList.add('success');
        
        // Re-render the listings table after a short delay to show the change
        setTimeout(() => {
            switchModule('listings');
            getLandlordListings();
        }, 1500);
    }


    // --- Event Listeners ---

    // 1. Navigation Clicks
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            const targetId = e.currentTarget.getAttribute('href').substring(1);
            setActiveNav(e.currentTarget);
            switchModule(targetId);

            // Fetch data for the relevant module
            if (targetId === 'listings') {
                getLandlordListings();
            } else if (targetId === 'feedback') {
                getAllFeedback();
            } else if (targetId === 'overview') {
                // Listings fetching (inside getLandlordListings) also updates overview stats
                getLandlordListings(); 
            }
        });
    });

    // 2. View Stats Click (Goes to Listing Details) and Edit Click (attached dynamically)
    function attachViewStatsListeners() {
        const viewStatsButtons = document.querySelectorAll('.view-stats-btn');
        viewStatsButtons.forEach(btn => {
            // Remove old listener if one existed (preventing duplicates)
            btn.removeEventListener('click', handleViewStatsClick);
            // Add new listener
            btn.addEventListener('click', handleViewStatsClick); 
        });
    }

    function attachEditListeners() {
        const editButtons = document.querySelectorAll('.edit-listing-btn');
        editButtons.forEach(editBtn => {
            const row = editBtn.closest('.table-row');
            // FIX: Using listing_id
            const listingID = row.dataset.listingId;
            // Remove/Add Listener Pattern to ensure no duplicates
            editBtn.removeEventListener('click', (e) => handleEditClick(e, listingID));
            editBtn.addEventListener('click', (e) => handleEditClick(e, listingID));
        });
    }

    function handleViewStatsClick(e) {
        const row = e.target.closest('.table-row');
        // FIX: Using listing_id
        const listingID = row.dataset.listingId;
        const listingName = row.querySelector('div').textContent.trim();
        
        renderListingDetails(listingID, listingName);
        setActiveNav(listingsNav); 
    }
    
    // NEW: Handle Edit button click
    function handleEditClick(e, listingID) {
        e.preventDefault();
        openEditListingForm(listingID);
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
    
    // Placeholder function for the "Add New Listing" button
    window.openListingForm = function() {
        // You can now implement a modal here or switch to the #add-listing module you prepared.
        alert("Opening the Landlord Listing Form modal (conceptual action)...");
    };
    
    // --- Initial Load ---
    // Start by fetching data for the default active module (Overview/Listings)
    getLandlordListings();
});