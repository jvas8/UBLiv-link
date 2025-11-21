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
        
        // FIXED: Use proper single .select() with all required fields
        const { data: listings, error } = await supabase
            .from('listings')
            .select(`
                listing_id, 
                name, 
                price, 
                availability, 
                property_details(bedrooms), 
                reviews(rating)
            `)
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
    
    // --- FIXED FUNCTION: Render Recent Activity on Overview Page ---
    async function renderRecentActivity() {
        const landlordId = await getCurrentLandlordId();
        recentActivityContainer.innerHTML = '<p>Loading recent activity...</p>';
        
        if (!landlordId) {
            recentActivityContainer.innerHTML = '<p class="error-message">Cannot load activity: User not logged in.</p>';
            return;
        }

        const { data: reviews, error } = await supabase
            .from('reviews')
            .select(`
                rating, 
                description, 
                created_at, 
                listings(name, landlord_id)
            `)
            .eq('listings.landlord_id', landlordId)
            .order('created_at', { ascending: false })
            .limit(5);

        if (error) {
            console.error('Error fetching recent activity:', error);
            recentActivityContainer.innerHTML = `<p class="error-message">Error loading recent activity: ${error.message}</p>`;
            return;
        }

        // FIXED: Add defensive check for null/undefined data
        if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
            recentActivityContainer.innerHTML = '<p>No recent activity to display.</p>';
            return;
        }

        const activityHTML = reviews.map(review => {
            // FIXED: Add defensive check for individual review objects
            if (!review || !review.listings) {
                console.warn('Invalid review data encountered:', review);
                return '';
            }
            
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
            .select(`
                listing_id, 
                rating, 
                description, 
                created_at, 
                user_id, 
                listings(name, landlord_id)
            `)
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

        // FIXED: Add defensive check for null/undefined data
        if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
            allFeedbackContainer.innerHTML = '<p>No feedback has been submitted yet.</p>';
            return;
        }

        reviews.forEach(review => {
            // FIXED: Add defensive check for individual review objects
            if (!review || !review.listings) {
                console.warn('Invalid feedback data encountered:', review);
                return;
            }
            
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
            .select(`
                name, 
                price, 
                availability, 
                property_details(bedrooms, description)
            `)
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

    // --- FIXED FUNCTION: Handle New Listing Submission with Full Photo Upload Logic ---
    async function handleNewListingSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const submitBtn = form.querySelector('.submit-btn');

        submitBtn.disabled = true;
        submitBtn.textContent = 'Publishing...';
        
        // 1. Get Landlord ID
        const landlordId = await getCurrentLandlordId(); 
        if (!landlordId) {
            alert('Authentication error: Landlord ID not found. Please log in again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Publish Listing';
            return;
        }

        try {
            // --- Step A: Insert into the 'listings' table ---
            
            // FIXED: Validate required fields before submission
            const listingName = formData.get('name');
            if (!listingName || listingName.trim() === '') {
                throw new Error('Listing Name is required and cannot be empty.');
            }
            
            const listingData = {
                landlord_id: landlordId,
                name: listingName.trim(),
                location: formData.get('location'),
                price: parseFloat(formData.get('price')),
                leasing: formData.get('leasing'),
                email: formData.get('email') || null,
            };

            let { data: newListing, error: listingError } = await supabase
                .from('listings')
                .insert([listingData])
                .select('listing_id') 
                .single();

            if (listingError) throw new Error('Listing Insert Error: ' + listingError.message);
            
            const newListingId = newListing.listing_id;

            // --- Step B: Insert into the 'property_details' table ---

            const propertyDetailsData = {
                listing_id: newListingId,
                property_type: formData.get('property_type'),
                bedrooms: parseInt(formData.get('bedrooms')),
                description: formData.get('description'),
            };

            const { error: detailsError } = await supabase
                .from('property_details')
                .insert([propertyDetailsData]);

            if (detailsError) throw new Error('Property Details Insert Error: ' + detailsError.message);

            // --- Step C: Handle Photo Upload and 'photos' table insert (FULL IMPLEMENTATION) ---
            
            const files = form.elements['photos[]'].files;
            const photoRecords = [];
            const bucketName = 'listing-images'; // NOTE: Ensure this bucket exists in Supabase Storage

            if (files && files.length > 0) {
                console.log(`Uploading ${files.length} photos...`);
                
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    // Create a unique path in storage: landlordId/listingId/timestamp_filename
                    const filePath = `${landlordId}/${newListingId}/${Date.now()}_${file.name}`;
                    
                    // 1. Upload the file to Supabase Storage
                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from(bucketName)
                        .upload(filePath, file);

                    if (uploadError) {
                        // Log the error but don't stop the whole process, just skip this photo
                        console.error(`Error uploading file ${file.name}:`, uploadError.message);
                        continue; 
                    }

                    // 2. Get the public URL for the uploaded file
                    const { data: publicUrlData } = supabase.storage
                        .from(bucketName)
                        .getPublicUrl(uploadData.path); 
                    
                    // 3. Prepare the record for the public.photos table
                    photoRecords.push({
                        listing_id: newListingId,
                        photo_url: publicUrlData.publicUrl
                    });
                }
                
                // 4. Insert all successful photo URLs into the public.photos table
                if (photoRecords.length > 0) {
                    const { error: photoInsertError } = await supabase
                        .from('photos')
                        .insert(photoRecords);

                    if (photoInsertError) {
                        // This is a critical warning, as images exist but links are missing from DB
                        console.warn('CRITICAL: Photo URL insertion into DB failed:', photoInsertError.message);
                        alert('Warning: Listing added, but photo links failed to save to the database.');
                    }
                }
            }

            // --- Final Success ---
            const photoMessage = photoRecords.length > 0 ? ` with ${photoRecords.length} photo(s) added.` : `. No photos were included.`;
            alert(`Listing "${listingData.name}" submitted successfully for verification${photoMessage}`);
            form.reset();
            
        } catch (error) {
            console.error('New Listing Submission Failed:', error);
            alert(`Error during submission: ${error.message}`);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Publish Listing';
            
            // Clean up and refresh UI
            switchModule('listings'); 
            getLandlordListings(); // Refresh the listings to show the new one
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