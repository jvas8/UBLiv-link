// student-dashboard.js - Logic for Student Dashboard page

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Supabase client definition (duplicated from auth.js for simplicity)
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
        window.location.href = "index.html"; // Redirect to login page
    });
});


/**
 * Authentication and User Profile Management
 * Fetches the user_id for use in review submissions.
 */
async function checkAuthAndFetchUser() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        // Not logged in, redirect to login page
        window.location.href = "index.html"; 
        return;
    }
    
    const userEmail = session.user.email;
    
    // Fetch user details from the 'users' table using the email
    const { data: userData, error } = await supabase
        .from("users")
        .select("user_id, name, role") // Select user_id as per your schema
        .eq("email", userEmail)
        .single();

    if (error || !userData) {
        console.error("Error fetching user profile:", error ? error.message : "User profile not found.");
        await supabase.auth.signOut(); // Force logout
        window.location.href = "index.html"; 
        return;
    }
    
    currentUserID = userData.user_id; // Store the user_id
    
    // Update welcome message
    const welcomeMessage = document.getElementById("welcome-message");
    if (welcomeMessage) {
        // Capitalize role for display
        const role = userData.role.charAt(0).toUpperCase() + userData.role.slice(1);
        welcomeMessage.innerHTML = `Welcome, <strong>${userData.name}</strong> (${role})`;
    }
}


/**
 * Listing Display and Review Logic (Adheres to your schemas)
 */
async function fetchAndDisplayListings() {
    const loadingSpinner = document.getElementById("loading-spinner");
    const listingContainer = document.getElementById("listing-container");

    loadingSpinner.style.display = "flex";
    listingContainer.innerHTML = ""; // Clear existing listings

    // FIX: Removed the embedded comment which was causing the 400 Bad Request error.
    // The query now correctly uses 'landlord_id' for the join path.
    const { data: listings, error } = await supabase
        .from("listings")
        .select(`
            listing_id,
            name,
            location,
            price,
            image_url, 
            landlord_id(email), 
            property_details(property_type),
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
    
    if (listings.length === 0) {
        listingContainer.innerHTML = `<p class="info-message">No approved listings are currently available.</p>`;
        return;
    }

    listings.forEach(listing => {
        // Calculate average rating from the 'reviews' array
        const avgRating = calculateAverageRating(listing.reviews);
        // Get property type (accessing the joined data)
        const propertyType = listing.property_details.length > 0 ? listing.property_details[0].property_type : 'N/A';
        
        // Access the email using the 'landlord_id' property
        const landlordEmail = listing.landlord_id ? listing.landlord_id.email : 'contact@landlord.com'; 
        
        listingContainer.innerHTML += createListingCard(listing, propertyType, avgRating, landlordEmail);
    });

    // Add event listeners for the 'Leave a Review' buttons
    document.querySelectorAll(".btn-review").forEach(button => {
        button.addEventListener("click", openReviewModal);
    });
}

function calculateAverageRating(ratingsArray) {
    if (!ratingsArray || ratingsArray.length === 0) return 0;
    
    const sum = ratingsArray.reduce((acc, current) => acc + current.rating, 0);
    return (sum / ratingsArray.length).toFixed(1);
}

// HTML generation function using your existing CSS classes
function createListingCard(listing, propertyType, avgRating, landlordEmail) {
    const starRatingHTML = generateStarRating(avgRating);
    const imageUrl = listing.image_url || './images/default-listing.jpg'; // Use a default image if none exists
    
    return `
        <div class="listing-card">
            <img src="${imageUrl}" alt="Image of ${listing.name}">

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
    
    // Set hidden form fields
    document.getElementById("review-listing-id").value = listingId;
    document.getElementById("review-user-id").value = currentUserID;
    
    // Update modal subtitle
    document.getElementById("modal-subtitle").textContent = `Review for: ${listingTitle}`;

    // Reset form and show modal
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
        // Refresh listings to show updated average rating
        fetchAndDisplayListings();

    } catch (error) {
        console.error("Unexpected error during review submission:", error);
        alert("An unexpected error occurred.");
    } finally {
        submitBtn.textContent = "Submit Review";
        submitBtn.disabled = false;
    }
}