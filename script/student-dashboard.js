// student-dashboard.js - Logic for Student Dashboard page

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Supabase client definition
const supabaseUrl = "https://dquslrxlpmrersnjybym.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdXNscnhscG1yZXJzbmp5YnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNDg4NTYsImV4cCI6MjA3ODcyNDg1Nn0.ICkT2aVP_Ngr3Z24V2b9WLUxvcM-e6B84WkATqt94a8";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

let currentUserID = null; 

document.addEventListener("DOMContentLoaded", async function() {
    // 1. Check auth and fetch user profile to get 'user_id'
    await checkAuthAndFetchUser();

    // 2. Set up Event Listeners for the Review Modal
    const reviewModal = document.getElementById("review-modal");
    
    document.getElementById("cancel-review-btn").addEventListener("click", () => {
        reviewModal.style.display = "none";
    });

    document.getElementById("review-form").addEventListener("submit", handleReviewSubmit);

    // 3. Initial load of listings
    fetchAndDisplayListings();

    // 4. Logout functionality
    document.getElementById("logout-btn").addEventListener("click", async () => {
        await supabase.auth.signOut();
        window.location.href = "index.html";
    });
});

/**
 * Authentication and User Profile Management
 */
async function checkAuthAndFetchUser() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        window.location.href = "index.html"; 
        return;
    }
    
    const userEmail = session.user.email;
    
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

    // First, let's test if we can fetch photos at all
    console.log("Testing photos table access...");
    const { data: testPhotos, error: testError } = await supabase
        .from("photos")
        .select("*")
        .limit(5);

    if (testError) {
        console.error("Cannot access photos table:", testError);
    } else {
        console.log("Test photos query result:", testPhotos);
    }

    // Fetch listings
    const { data: listings, error } = await supabase
        .from("listings")
        .select(`
            listing_id,
            name,
            location,
            price,
            landlord_id(email), 
            property_details(property_type, bedrooms, description),
            reviews(rating)
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

    // Get all listing IDs
    const listingIds = listings.map(l => l.listing_id);
    console.log("Listing IDs to fetch photos for:", listingIds);

    // Fetch photos for all listings - try different approaches
    let allPhotos = [];
    
    // Approach 1: Try to fetch all photos without filtering first
    const { data: allPhotosData, error: allPhotosError } = await supabase
        .from("photos")
        .select("listing_id, photo_url")
        .limit(100); // Get first 100 photos to see what's there

    if (allPhotosError) {
        console.error("Error fetching all photos:", allPhotosError);
    } else {
        console.log("All photos in database:", allPhotosData);
        allPhotos = allPhotosData || [];
    }

    // If that didn't work, try with the specific listing IDs
    if (allPhotos.length === 0 && listingIds.length > 0) {
        const { data: filteredPhotos, error: filteredError } = await supabase
            .from("photos")
            .select("listing_id, photo_url")
            .in("listing_id", listingIds);

        if (filteredError) {
            console.error("Error fetching filtered photos:", filteredError);
        } else {
            console.log("Filtered photos:", filteredPhotos);
            allPhotos = filteredPhotos || [];
        }
    }

    // Group photos by listing_id
    const photosByListing = {};
    allPhotos.forEach(photo => {
        if (!photosByListing[photo.listing_id]) {
            photosByListing[photo.listing_id] = [];
        }
        photosByListing[photo.listing_id].push(photo);
    });

    console.log("Photos grouped by listing:", photosByListing);

    listings.forEach(listing => {
        const avgRating = calculateAverageRating(listing.reviews);
        
        // Handle property_details whether it's an object or array
        let propertyType = 'N/A';
        if (listing.property_details) {
            if (Array.isArray(listing.property_details)) {
                propertyType = listing.property_details.length > 0 ? listing.property_details[0].property_type : 'N/A';
            } else {
                propertyType = listing.property_details.property_type || 'N/A';
            }
        }
        
        const landlordEmail = listing.landlord_id ? listing.landlord_id.email : 'contact@landlord.com';
        
        // Get photos from our grouped photos object
        const photos = photosByListing[listing.listing_id] || [];
        
        console.log(`Listing ${listing.name} (${listing.listing_id}) has ${photos.length} photos`);
        
        listingContainer.innerHTML += createListingCard(listing, propertyType, avgRating, landlordEmail, photos);
    });

    // Add event listeners for review buttons
    document.querySelectorAll(".btn-review").forEach(button => {
        button.addEventListener("click", openReviewModal);
    });

    // Initialize image carousels
    initializeImageCarousels();
}

function calculateAverageRating(ratingsArray) {
    if (!ratingsArray || ratingsArray.length === 0) return 0;
    
    const sum = ratingsArray.reduce((acc, current) => acc + current.rating, 0);
    return (sum / ratingsArray.length).toFixed(1);
}

/**
 * Create listing card with image carousel
 */
function createListingCard(listing, propertyType, avgRating, landlordEmail, photos) {
    const starRatingHTML = generateStarRating(avgRating);
    
    // Generate carousel HTML
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
                    <span class="avg-text">(${avgRating > 0 ? avgRating : 'No Reviews'})</span>
                </div>

                <p class="listing-price">
                    $${listing.price} 
                    <span class="price-period">/ month</span>
                </p>
                <p class="listing-location">${listing.location}</p>
            </div>
            
            <div class="listing-actions">
                <a href="mailto:${landlordEmail}" class="btn-contact">Contact Landlord</a>
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
        fetchAndDisplayListings();

    } catch (error) {
        console.error("Unexpected error during review submission:", error);
        alert("An unexpected error occurred.");
    } finally {
        submitBtn.textContent = "Submit Review";
        submitBtn.disabled = false;
    }
}