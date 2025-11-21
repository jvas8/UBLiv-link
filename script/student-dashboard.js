// student-dashboard.js - Logic for Student Dashboard page

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Supabase client definition
const supabaseUrl = "https://dquslrxlpmrersnjybym.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdXNscnhscG1yZXJzbmp5YnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNDg4NTYsImV4cCI6MjA3ODcyNDg1Nn0.ICkT2aVP_Ngr3Z24V2b9WLUxvcM-e6B84WkATqt94a8";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

let currentUserID = null; 
let currentUserEmail = null; // NEW: Store user email for contact form
let allListings = [];

document.addEventListener("DOMContentLoaded", async function() {
    // 1. Check auth and fetch user profile to get 'user_id' and email
    await checkAuthAndFetchUser();

    // 2. Set up Event Listeners for the Review Modal
    const reviewModal = document.getElementById("review-modal");
    
    document.getElementById("cancel-review-btn").addEventListener("click", () => {
        reviewModal.style.display = "none";
    });

    document.getElementById("review-form").addEventListener("submit", handleReviewSubmit);

    // 3. Set up Event Listeners for the Contact Modal (NEW SECTION)
    const contactModal = document.getElementById("contact-modal");

    // Close handler for Contact Modal (clicking outside form)
    contactModal.addEventListener("click", (e) => {
        if (e.target.id === 'contact-modal') {
            contactModal.style.display = "none";
        }
    });

    document.getElementById("contact-form").addEventListener("submit", handleContactSubmit);
    setupContactFormSteps(); // Function to handle next/prev buttons
    // (END NEW SECTION)

    // 4. Initial load of listings
    fetchAndDisplayListings();

    // 5. Logout functionality
    document.getElementById("logout-btn").addEventListener("click", async () => {
        await supabase.auth.signOut();
        window.location.href = "index.html";
    });
});

/**
 * Authentication and User Profile Management (MODIFIED)
 */
async function checkAuthAndFetchUser() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        window.location.href = "index.html"; 
        return;
    }
    
    const userEmail = session.user.email;
    currentUserEmail = userEmail; // NEW: Store student's email
    
    const { data: userData, error } = await supabase
        .from("users")
        .select("user_id, name, role")
        .eq("email", userEmail)
        .single();

    if (error || !userData) {
        console.error("Error fetching user profile:", error ? error.message : "User profile not found.");
        await supabase.auth.signOut();
        window.location.href = "index.html"; 
        return;
    }
    
    currentUserID = userData.user_id;
    
    const welcomeMessage = document.getElementById("welcome-message");
    if (welcomeMessage) {
        const role = userData.role.charAt(0).toUpperCase() + userData.role.slice(1);
        welcomeMessage.innerHTML = `Welcome, <strong>${userData.name}</strong> (${role})`;
    }
}

/**
 * Fetch and display listings with proper image handling
 */
async function fetchAndDisplayListings() {
    const loadingSpinner = document.getElementById("loading-spinner");
    const listingContainer = document.getElementById("listing-container");

    loadingSpinner.style.display = "flex";
    listingContainer.innerHTML = "";

    console.log("Starting to fetch listings...");

    // Fetch listings (removed reviews(*) from the select)
    const { data: listings, error } = await supabase
        .from("listings")
        .select(`
            listing_id,
            name,
            location,
            price,
            landlord_id(email), 
            property_details(property_type, bedrooms, description)
        `)
        .eq("verification_status", "verified")
        .order("created_at", { ascending: false });

    loadingSpinner.style.display = "none";

    if (error) {
        console.error("Error fetching listings:", error);
        listingContainer.innerHTML = `<p class="error-message">Could not load listings. Please try again.</p>`;
        return;
    }
    
    console.log("Fetched listings:", listings);
    
    if (listings.length === 0) {
        listingContainer.innerHTML = `<p class="info-message">No approved listings are currently available.</p>`;
        return;
    }

    // Store listings globally for filtering
    allListings = listings;

    // --- NEW: Fetch all reviews for all fetched listings ---
    const { data: allReviews, error: reviewsError } = await supabase
        .from("reviews")
        .select(`listing_id, rating`) // Only need listing_id and rating for calculating average
        .in("listing_id", listings.map(l => l.listing_id));

    if (reviewsError) {
        console.error("Error fetching reviews:", reviewsError);
    }

    // Group reviews by listing_id
    const reviewsByListing = {};
    if (allReviews) {
        allReviews.forEach(review => {
            if (!reviewsByListing[review.listing_id]) {
                reviewsByListing[review.listing_id] = [];
            }
            // Store the full review object or just the rating
            reviewsByListing[review.listing_id].push(review); 
        });
    }
    // --- END NEW BLOCK ---

    // Populate filters with the listings data
    populateFilters(listings);

    // Fetch photos for all listings
    const listingIds = listings.map(l => l.listing_id);
    const { data: allPhotos, error: photosError } = await supabase
        .from("photos")
        .select("listing_id, photo_url")
        .in("listing_id", listingIds);

    if (photosError) {
        console.error("Error fetching photos:", photosError);
    }

    // Group photos by listing_id
    const photosByListing = {};
    if (allPhotos) {
        allPhotos.forEach(photo => {
            if (!photosByListing[photo.listing_id]) {
                photosByListing[photo.listing_id] = [];
            }
            photosByListing[photo.listing_id].push(photo);
        });
    }

    console.log("Photos grouped by listing:", photosByListing);

    // Display all listings initially
    displayListingsWithPhotos(listings, photosByListing, reviewsByListing);
}

/**
 * Populate filter dropdowns with available options
 */
function populateFilters(listings) {
    const typeFilter = document.getElementById("type-filter");
    const locationFilter = document.getElementById("location-filter");
    
    // Clear existing options (keep "All Types" and "All Locations")
    while (typeFilter.children.length > 1) {
        typeFilter.removeChild(typeFilter.lastChild);
    }
    while (locationFilter.children.length > 1) {
        locationFilter.removeChild(locationFilter.lastChild);
    }
    
    // Get unique property types
    const propertyTypes = [...new Set(listings.map(listing => {
        if (listing.property_details) {
            return Array.isArray(listing.property_details) 
                ? listing.property_details[0]?.property_type 
                : listing.property_details.property_type;
        }
        return null;
    }).filter(type => type && type !== 'N/A'))];
    
    // Get unique locations
    const locations = [...new Set(listings.map(listing => listing.location).filter(location => location))];
    
    // Populate property type filter
    propertyTypes.forEach(type => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type;
        typeFilter.appendChild(option);
    });
    
    // Populate location filter
    locations.forEach(location => {
        const option = document.createElement("option");
        option.value = location;
        option.textContent = location;
        locationFilter.appendChild(option);
    });
    
    // Add event listeners for filters
    document.getElementById("apply-filters-btn").addEventListener("click", () => applyFilters());
    document.getElementById("search-box").addEventListener("input", () => applyFilters());
}

/**
 * Apply filters to listings
 */
function applyFilters() {
    const typeFilter = document.getElementById("type-filter").value;
    const locationFilter = document.getElementById("location-filter").value;
    const priceFilter = document.getElementById("price-filter").value;
    const searchBox = document.getElementById("search-box").value.toLowerCase();
    
    const filteredListings = allListings.filter(listing => {
        // Property type filter
        if (typeFilter) {
            const listingType = listing.property_details 
                ? (Array.isArray(listing.property_details) 
                    ? listing.property_details[0]?.property_type 
                    : listing.property_details.property_type)
                : 'N/A';
            if (listingType !== typeFilter) return false;
        }
        
        // Location filter
        if (locationFilter && listing.location !== locationFilter) return false;
        
        // Price filter
        if (priceFilter) {
            const price = listing.price;
            if (priceFilter === "Under $500" && price >= 500) return false;
            if (priceFilter === "$500 - $800" && (price < 500 || price > 800)) return false;
            if (priceFilter === "$800+" && price <= 800) return false;
        }
        
        // Search filter
        if (searchBox) {
            const searchText = searchBox.toLowerCase();
            const matchesName = listing.name.toLowerCase().includes(searchText);
            const matchesLocation = listing.location.toLowerCase().includes(searchText);
            const matchesDescription = listing.property_details?.description?.toLowerCase().includes(searchText);
            
            if (!matchesName && !matchesLocation && !matchesDescription) return false;
        }
        
        return true;
    });
    
    // Display filtered listings
    displayFilteredListings(filteredListings);
}

/**
 * Display filtered listings
 */
async function displayFilteredListings(listings) {
    const listingContainer = document.getElementById("listing-container");
    listingContainer.innerHTML = "";
    
    if (listings.length === 0) {
        listingContainer.innerHTML = `<p class="info-message">No listings match your filters.</p>`;
        return;
    }
    
    // Fetch photos for filtered listings
    const listingIds = listings.map(l => l.listing_id);
    const { data: allPhotos, error: photosError } = await supabase
        .from("photos")
        .select("listing_id, photo_url")
        .in("listing_id", listingIds);
    
    const photosByListing = {};
    if (allPhotos) {
        allPhotos.forEach(photo => {
            if (!photosByListing[photo.listing_id]) {
                photosByListing[photo.listing_id] = [];
            }
            photosByListing[photo.listing_id].push(photo);
        });
    }
    
    // --- NEW: Fetch reviews for filtered listings ---
    const { data: allReviews, error: reviewsError } = await supabase
        .from("reviews")
        .select(`listing_id, rating`)
        .in("listing_id", listingIds);
        
    const reviewsByListing = {};
    if (allReviews) {
        allReviews.forEach(review => {
            if (!reviewsByListing[review.listing_id]) {
                reviewsByListing[review.listing_id] = [];
            }
            reviewsByListing[review.listing_id].push(review);
        });
    }
    // --- END NEW ---
    
    // Display each listing
    displayListingsWithPhotos(listings, photosByListing, reviewsByListing);
}

/**
 * Display listings with their photos and reviews (MODIFIED)
 */
function displayListingsWithPhotos(listings, photosByListing, reviewsByListing = {}) {
    const listingContainer = document.getElementById("listing-container");
    listingContainer.innerHTML = "";
    
    // Display each listing
    listings.forEach(listing => {
        listing.reviews = reviewsByListing[listing.listing_id] || [];
        
        const avgRating = calculateAverageRating(listing.reviews);
        
        let propertyType = 'N/A';
        if (listing.property_details) {
            if (Array.isArray(listing.property_details)) {
                propertyType = listing.property_details.length > 0 ? listing.property_details[0].property_type : 'N/A';
            } else {
                propertyType = listing.property_details.property_type || 'N/A';
            }
        }
        
        const landlordEmail = listing.landlord_id ? listing.landlord_id.email : 'contact@landlord.com';
        const photos = photosByListing[listing.listing_id] || [];

        // Pass landlordEmail to createListingCard
        listingContainer.innerHTML += createListingCard(listing, propertyType, avgRating, landlordEmail, photos);
    });
    
    // Re-initialize carousels and modal buttons
    initializeImageCarousels();
    document.querySelectorAll(".btn-review").forEach(button => {
        button.addEventListener("click", openReviewModal);
    });
    
    // NEW: Attach listener to the Contact Landlord buttons
    document.querySelectorAll(".btn-contact").forEach(button => {
        button.addEventListener("click", openContactModal);
    });
}

function calculateAverageRating(reviewsArray) {
    if (!reviewsArray || reviewsArray.length === 0) return 0;
    
    const ratings = reviewsArray.map(review => {
        if (typeof review === 'object' && review !== null && 'rating' in review) {
            return parseInt(review.rating, 10);
        }
        return parseInt(review, 10);
    }).filter(rating => !isNaN(rating));
    
    if (ratings.length === 0) return 0;

    const sum = ratings.reduce((acc, current) => acc + current, 0);
    return (sum / ratings.length).toFixed(1);
}

/**
 * Create listing card with image carousel (MODIFIED)
 */
function createListingCard(listing, propertyType, avgRating, landlordEmail, photos) {
    const starRatingHTML = generateStarRating(avgRating);
    const reviewCount = listing.reviews ? listing.reviews.length : 0;
    const carouselHTML = generateImageCarousel(photos, listing.name);
    
    return `
        <div class="listing-card">
            ${carouselHTML}
            
            <div class="listing-info">
                <div class="listing-header">
                    <h3>${listing.name}</h3>
                    <span class="type-badge">${propertyType}</span> 
                </div>

                <div class="rating-info">
                    ${starRatingHTML}
                    <span class="avg-text">${reviewCount > 0 ? `${reviewCount} review${reviewCount !== 1 ? 's' : ''}` : 'No reviews yet'}</span>
                </div>

                <p class="listing-price">
                    $${listing.price} 
                    <span class="price-period">/ month</span>
                </p>
                <p class="listing-location">${listing.location}</p>
            </div>
            
            <div class="listing-actions">
                <button class="btn-contact" 
                    data-listing-id="${listing.listing_id}" 
                    data-listing-title="${listing.name}"
                    data-landlord-email="${landlordEmail}">
                    Contact Landlord
                </button>
                <button class="btn-review" data-listing-id="${listing.listing_id}" data-listing-title="${listing.name}">Leave a Review</button>
            </div>
        </div>
    `;
}

/**
 * Generate image carousel HTML
 */
function generateImageCarousel(photos, listingName) {
    if (!photos || photos.length === 0) {
        // Use a working default image URL
        return `<img src="https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?ixlib=rb-4.0.3&w=600" alt="Image of ${listingName}" class="listing-image">`;
    }

    const carouselId = `carousel-${Math.random().toString(36).substr(2, 9)}`;
    
    let slidesHTML = '';
    let indicatorsHTML = '';
    
    photos.forEach((photo, index) => {
        const isActive = index === 0 ? 'active' : '';
        
        // Use the photo URL directly
        const photoUrl = photo.photo_url;
        
        slidesHTML += `
            <div class="carousel-slide ${isActive}">
                <img src="${photoUrl}" alt="Image ${index + 1} of ${listingName}" 
                     onerror="this.src='https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?ixlib=rb-4.0.3&w=600'">
            </div>
        `;
        
        indicatorsHTML += `
            <button class="carousel-indicator ${isActive}" 
                    data-slide-to="${index}"></button>
        `;
    });

    const navigationHTML = photos.length > 1 ? `
        <button class="carousel-prev">❮</button>
        <button class="carousel-next">❯</button>
        <div class="carousel-indicators">${indicatorsHTML}</div>
    ` : '';

    return `
        <div class="image-carousel" id="${carouselId}">
            <div class="carousel-container">
                <div class="carousel-track">${slidesHTML}</div>
            </div>
            ${navigationHTML}
        </div>
    `;
}

/**
 * Initialize all image carousels
 */
function initializeImageCarousels() {
    document.querySelectorAll('.image-carousel').forEach(carousel => {
        const track = carousel.querySelector('.carousel-track');
        const slides = carousel.querySelectorAll('.carousel-slide');
        const prevBtn = carousel.querySelector('.carousel-prev');
        const nextBtn = carousel.querySelector('.carousel-next');
        const indicators = carousel.querySelectorAll('.carousel-indicator');
        
        let currentSlide = 0;

        // Set initial position
        track.style.transform = `translateX(-${currentSlide * 100}%)`;

        function goToSlide(index) {
            if (index < 0) index = slides.length - 1;
            if (index >= slides.length) index = 0;
            
            currentSlide = index;
            track.style.transform = `translateX(-${currentSlide * 100}%)`;
            
            // Update active states
            slides.forEach((slide, i) => {
                slide.classList.toggle('active', i === currentSlide);
            });
            
            indicators.forEach((indicator, i) => {
                indicator.classList.toggle('active', i === currentSlide);
            });
        }

        // Navigation buttons
        if (prevBtn) {
            prevBtn.addEventListener('click', () => goToSlide(currentSlide - 1));
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => goToSlide(currentSlide + 1));
        }

        // Indicators
        indicators.forEach((indicator, index) => {
            indicator.addEventListener('click', () => goToSlide(index));
        });

        // Auto-advance (optional)
        if (slides.length > 1) {
            let slideInterval = setInterval(() => {
                goToSlide(currentSlide + 1);
            }, 5000);

            // Pause on hover
            carousel.addEventListener('mouseenter', () => clearInterval(slideInterval));
            carousel.addEventListener('mouseleave', () => {
                slideInterval = setInterval(() => {
                    goToSlide(currentSlide + 1);
                }, 5000);
            });
        }
    });
}

function generateStarRating(rating) {
    let stars = '';
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating - fullStars >= 0.5;
    
    for (let i = 0; i < fullStars; i++) {
        stars += '★'; 
    }
    if (hasHalfStar) {
        stars += '½'; 
    }
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    for (let i = 0; i < emptyStars; i++) {
        stars += '☆'; 
    }
    return `<div class="stars">${stars}</div>`;
}

function openReviewModal(event) {
    if (!currentUserID) {
        alert("User ID not loaded. Please refresh.");
        return;
    }
    
    const listingId = event.target.getAttribute("data-listing-id");
    const listingTitle = event.target.getAttribute("data-listing-title");
    
    document.getElementById("review-listing-id").value = listingId;
    document.getElementById("review-user-id").value = currentUserID;
    
    document.getElementById("modal-subtitle").textContent = `Review for: ${listingTitle}`;

    document.getElementById("review-form").reset();
    document.getElementById("review-modal").style.display = "flex";
}

async function handleReviewSubmit(e) {
    e.preventDefault();
    
    const reviewModal = document.getElementById("review-modal");
    const submitBtn = document.getElementById("submit-review-btn");
    
    submitBtn.textContent = "Submitting...";
    submitBtn.disabled = true;

    const listingID = document.getElementById("review-listing-id").value;
    const userID = document.getElementById("review-user-id").value;
    const rating = document.querySelector('input[name="rating"]:checked')?.value;
    const reviewText = document.getElementById("reviewText").value;
    
    if (!rating) {
        alert("Please select an overall rating (1-5 stars).");
        submitBtn.textContent = "Submit Review";
        submitBtn.disabled = false;
        return;
    }

    try {
        // Run verification checks concurrently for efficiency
        const [listingResult, userResult] = await Promise.all([
            supabase.from("listings").select("verification_status").eq("listing_id", listingID).single(),
            supabase.from("users").select("role").eq("user_id", userID).single()
        ]);
        
        const listing = listingResult.data;
        const listingError = listingResult.error;
        const user = userResult.data;
        const userError = userResult.error;

        if (listingError || !listing || listing.verification_status !== 'verified') {
            alert("Cannot submit review: Listing is not available or not verified.");
            return;
        }

        if (userError || !user || user.role !== 'student') {
            alert("Only students can submit reviews.");
            return;
        }

        // Submit the review
        const { error } = await supabase
            .from("reviews")
            .insert([
                {
                    listing_id: listingID,
                    user_id: userID,
                    rating: parseInt(rating),
                    description: reviewText
                }
            ]);

        if (error) {
            console.error("Error submitting review:", error);
            alert("Failed to submit review: " + error.message);
            return;
        }

        alert("Review submitted successfully! Your feedback is appreciated.");
        reviewModal.style.display = "none";
        
        // Refresh the specific listing's reviews instead of reloading everything
        await refreshListingReviews(listingID);

    } catch (error) {
        console.error("Unexpected error during review submission:", error);
        alert("An unexpected error occurred.");
    } finally {
        submitBtn.textContent = "Submit Review";
        submitBtn.disabled = false;
    }
}

/**
 * Refresh reviews for a specific listing and update the display
 */
async function refreshListingReviews(listingId) {
    // Fetch updated reviews for this specific listing
    const { data: updatedReviews, error } = await supabase
        .from("reviews")
        .select(`listing_id, rating`) // Fetching only rating and ID is sufficient
        .eq("listing_id", listingId);

    if (error) {
        console.error("Error fetching updated reviews:", error);
        return;
    }

    // Update the reviews array for this listing in our global allListings
    const listingIndex = allListings.findIndex(listing => listing.listing_id === listingId);
    if (listingIndex !== -1) {
        // This is where the reviews data is persistently added to the listing object
        allListings[listingIndex].reviews = updatedReviews || []; 
        
        // Find the listing card in the DOM and update its rating
        updateListingCardRating(listingId, updatedReviews);
    }
}

/**
 * Update the rating display for a specific listing card
 */
function updateListingCardRating(listingId, reviews) {
    const avgRating = calculateAverageRating(reviews);
    const starRatingHTML = generateStarRating(avgRating);
    const reviewCount = reviews ? reviews.length : 0;
    
    // Find all listing cards
    const listingCards = document.querySelectorAll('.listing-card');
    
    listingCards.forEach(card => {
        const reviewButton = card.querySelector('.btn-review');
        if (reviewButton && reviewButton.getAttribute('data-listing-id') === listingId) {
            // Update the rating info
            const ratingInfo = card.querySelector('.rating-info');
            if (ratingInfo) {
                ratingInfo.innerHTML = `
                    ${starRatingHTML}
                    <span class="avg-text">${reviewCount > 0 ? `${reviewCount} review${reviewCount !== 1 ? 's' : ''}` : 'No reviews yet'}</span>
                `;
            }
        }
    });
}

/**
 * CONTACT FORM LOGIC (NEW SECTION: REQUIRED TO CALL YOUR EDGE FUNCTION)
 */
function setupContactFormSteps() {
    const contactModal = document.getElementById("contact-modal");
    const nextBtn = document.getElementById("contact-next-btn");
    const prevBtn = document.getElementById("contact-prev-btn");
    const formSteps = contactModal.querySelectorAll(".form-step");
    const steps = contactModal.querySelectorAll(".step");
    let currentStep = 0;

    const updateFormDisplay = () => {
        formSteps.forEach((step, index) => {
            step.classList.toggle("active", index === currentStep);
        });
        steps.forEach((step, index) => {
            step.classList.toggle("active", index <= currentStep);
        });
    };
    
    updateFormDisplay(); // Initialize to Step 1

    nextBtn.addEventListener("click", () => {
        // Validation check for Step 1: Request Type
        const requestType = contactModal.querySelector('input[name="requestType"]:checked');
        if (!requestType) {
            alert("Please select a Request Type to continue.");
            return;
        }

        if (currentStep < formSteps.length - 1) {
            currentStep++;
            updateFormDisplay();
        }
    });

    prevBtn.addEventListener("click", () => {
        if (currentStep > 0) {
            currentStep--;
            updateFormDisplay();
        }
    });
}

function openContactModal(event) {
    if (!currentUserEmail) {
        alert("Your user session email is not loaded. Please refresh.");
        return;
    }
    
    // Get data attributes from the button clicked
    const listingId = event.target.getAttribute("data-listing-id");
    const listingTitle = event.target.getAttribute("data-listing-title");
    const landlordEmail = event.target.getAttribute("data-landlord-email");
    
    // Set hidden fields
    document.getElementById("contact-listing-id").value = listingId;
    document.getElementById("contact-landlord-email").value = landlordEmail;
    
    // Update modal title
    document.getElementById("contact-modal-subtitle").textContent = `Listing: ${listingTitle}`;

    // Reset form to Step 1 and clear fields
    const contactForm = document.getElementById("contact-form");
    contactForm.reset();
    
    // Manually reset steps
    contactForm.querySelector('.form-step[data-step="1"]').classList.add('active');
    contactForm.querySelector('.form-step[data-step="2"]').classList.remove('active');
    document.getElementById("contact-progress-bar").querySelector('.step[data-step="1"]').classList.add('active');
    document.getElementById("contact-progress-bar").querySelector('.step[data-step="2"]').classList.remove('active');

    // Show modal
    document.getElementById("contact-modal").style.display = "flex";
}

// student-dashboard.js - Replace your current handleContactSubmit function with this:

async function handleContactSubmit(e) {
    e.preventDefault();
    
    const contactModal = document.getElementById("contact-modal");
    const submitBtn = document.getElementById("send-request-btn");
    
    submitBtn.textContent = "Sending...";
    submitBtn.disabled = true;

    const listingID = document.getElementById("contact-listing-id").value;
    const landlordEmail = document.getElementById("contact-landlord-email").value;
    const requestType = contactModal.querySelector('input[name="requestType"]:checked')?.value;
    const requestedDate = document.getElementById("requestedDate").value;
    const message = document.getElementById("message").value;
    const studentEmail = currentUserEmail; // The logged-in user's email

    if (!studentEmail || landlordEmail === 'contact@landlord.com') {
        alert("Error: Landlord or Student email information is missing.");
        submitBtn.textContent = "Send Request";
        submitBtn.disabled = false;
        return;
    }

    try {
        // 🚨 CORRECTED: Use supabase.functions.invoke() for Edge Functions
        const { error } = await supabase.functions.invoke('send_contact_request', {
            method: 'POST', // Edge Functions expect POST by default
            body: { // The payload must be inside the 'body' property
                target_landlord_email: landlordEmail,
                sender_student_email: studentEmail,
                listing_ref: listingID,
                request_type: requestType,
                preferred_date: requestedDate || null,
                inquiry_message: message
            }
        });

        if (error) {
            console.error("Error sending contact request:", error);
            // This alert message is correct, but the error source is now the function execution, not the 404.
            alert("Failed to send request. Check your Supabase logs for the 'send_contact_request' function error.");
            return;
        }

        alert("Contact request sent successfully! The landlord will respond to your registered email.");
        contactModal.style.display = "none";
        
    } catch (error) {
        console.error("Unexpected error during contact submission:", error);
        alert("An unexpected error occurred.");
    } finally {
        submitBtn.textContent = "Send Request";
        submitBtn.disabled = false;
    }
}
// (END NEW SECTION)