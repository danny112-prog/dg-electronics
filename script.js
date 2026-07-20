/* ═══════════════════════════════════════════════
   DG Electronics – Main Script
   ═══════════════════════════════════════════════ */

// ── Product Data ──
const products = [
  { id: 1, name: "Galaxy X Pro", category: "phones", price: 1350000, image: "images/phone1.svg", desc: "Flagship performance with a breathtaking AMOLED display.", badge: "new" },
  { id: 2, name: "iPhone 17 Pro Max", category: "phones", price: 1850000, image: "images/iphone-17-pro-max.jpg", desc: "The most powerful iPhone with an incredible camera system.", badge: "new" },
  { id: 3, name: "iPhone 16", category: "phones", price: 1500000, image: "images/iphone-16.jpg", desc: "Latest generation with advanced chip and stunning design." },
  { id: 4, name: "iPhone 15", category: "phones", price: 1250000, image: "images/iphone-15.jpg", desc: "Dynamic Island and 48MP camera for stunning photos." },
  { id: 5, name: "iPhone 12", category: "phones", price: 850000, image: "images/iphone-12.jpg", desc: "5G speed with A14 Bionic chip and OLED display.", badge: "sale" },
  { id: 6, name: "iPhone 11", category: "phones", price: 650000, image: "images/iphone-11.jpg", desc: "Dual camera system and all-day battery life.", badge: "sale" },
  { id: 7, name: "iPhone XR", category: "phones", price: 480000, image: "images/iphone-xr.jpg", desc: "Colorful design with Face ID and Liquid Retina display.", badge: "sale" },
  { id: 8, name: "NovaBook Air", category: "laptops", price: 1800000, image: "images/laptop1.svg", desc: "Thin, powerful, and beautifully designed for work and play.", badge: "new" },
  { id: 9, name: "Echo Buds", category: "accessories", price: 180000, image: "images/earbuds.svg", desc: "Immersive audio with noise cancellation and all-day comfort." },
  { id: 10, name: "SmartWatch Pro", category: "accessories", price: 350000, image: "images/smartwatch-pro.jpg", desc: "Track your fitness and stay connected on the go." },
  { id: 11, name: "Mini Speaker", category: "accessories", price: 85000, image: "images/placeholder.svg", desc: "Compact speaker with rich, room-filling sound." },
  { id: 12, name: "Fast Charger", category: "accessories", price: 45000, image: "images/placeholder.svg", desc: "Rapid charging for all your USB-C devices.", badge: "sale" },
];

// ── State ──
let cart = JSON.parse(localStorage.getItem('dg_cart') || '[]');
let activeCategory = "all";
let searchQuery = "";
let sortValue = "default";

function saveCart() {
  localStorage.setItem('dg_cart', JSON.stringify(cart));
}

// ── DOM References ──
const productGrid = document.getElementById("productGrid");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const categoryTabs = document.querySelectorAll(".tab");
const cartButton = document.getElementById("cartButton");
const cartSidebar = document.getElementById("cartSidebar");
const cartOverlay = document.getElementById("cartOverlay");
const cartClose = document.getElementById("cartClose");
const cartItems = document.getElementById("cartItems");
const cartCount = document.getElementById("cartCount");
const cartTotal = document.getElementById("cartTotal");
const backToTop = document.getElementById("backToTop");
const navbar = document.getElementById("navbar");
const loader = document.getElementById("loader");
const modalOverlay = document.getElementById("modalOverlay");
const productModal = document.getElementById("productModal");
const modalClose = document.getElementById("modalClose");
const modalBody = document.getElementById("modalBody");

// ═══════════════════════════════════════════════
// LOADING SCREEN
// ═══════════════════════════════════════════════
window.addEventListener("load", () => {
  setTimeout(() => {
    loader.classList.add("hidden");
    document.body.style.overflow = "";
  }, 800);
});

// ═══════════════════════════════════════════════
// SCROLL REVEAL
// ═══════════════════════════════════════════════
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
);

function initReveal() {
  document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));
}

// ═══════════════════════════════════════════════
// NAVBAR SCROLL EFFECT
// ═══════════════════════════════════════════════
let lastScroll = 0;
window.addEventListener("scroll", () => {
  const scrollY = window.scrollY;

  // Navbar shadow
  if (scrollY > 50) {
    navbar.classList.add("scrolled");
  } else {
    navbar.classList.remove("scrolled");
  }

  // Back to top button
  if (scrollY > 500) {
    backToTop.classList.add("visible");
  } else {
    backToTop.classList.remove("visible");
  }

  lastScroll = scrollY;
}, { passive: true });

// ═══════════════════════════════════════════════
// BACK TO TOP
// ═══════════════════════════════════════════════
backToTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ═══════════════════════════════════════════════
// MOBILE NAV TOGGLE
// ═══════════════════════════════════════════════
const toggleButton = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");

if (toggleButton && navLinks) {
  toggleButton.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    toggleButton.classList.toggle("active");
    toggleButton.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      toggleButton.classList.remove("active");
      toggleButton.setAttribute("aria-expanded", "false");
    });
  });
}

// ═══════════════════════════════════════════════
// RENDER PRODUCTS
// ═══════════════════════════════════════════════
function renderProducts() {
  let filtered = products.filter((p) => {
    const matchCategory = activeCategory === "all" || p.category === activeCategory;
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        p.desc.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  if (sortValue === "price-low") filtered.sort((a, b) => a.price - b.price);
  else if (sortValue === "price-high") filtered.sort((a, b) => b.price - a.price);
  else if (sortValue === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));

  if (filtered.length === 0) {
    productGrid.innerHTML = '<div class="no-products">No products found. Try adjusting your search or filter.</div>';
    return;
  }

  productGrid.innerHTML = filtered
    .map(
      (p) => `
    <article class="card" role="listitem">
      ${p.badge ? `<span class="card-badge badge-${p.badge}">${p.badge === "new" ? "New" : "Sale"}</span>` : ""}
      <div class="card-img-wrapper">
        <img src="${p.image}" alt="${p.name}" loading="lazy" width="300" height="200" />
        <div class="card-quick-view">
          <button class="quick-view-btn" data-id="${p.id}" aria-label="Quick view ${p.name}">Quick View</button>
        </div>
      </div>
      <h3>${p.name}</h3>
      <p>${p.desc}</p>
      <div class="card-bottom">
        <span class="card-price">₦${p.price.toLocaleString()}</span>
        <div class="card-actions">
          <button class="add-to-cart-btn" data-id="${p.id}" aria-label="Add ${p.name} to cart">Add to Cart</button>
          <button class="buy-now-btn" data-id="${p.id}" aria-label="Buy ${p.name} now">Buy Now</button>
        </div>
      </div>
    </article>
  `
    )
    .join("");

  // Attach event listeners
  productGrid.querySelectorAll(".add-to-cart-btn").forEach((btn) => {
    btn.addEventListener("click", () => addToCart(Number(btn.dataset.id)));
  });

  productGrid.querySelectorAll(".buy-now-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      addToCart(Number(btn.dataset.id));
      openCart();
    });
  });

  productGrid.querySelectorAll(".quick-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => openModal(Number(btn.dataset.id)));
  });
}

// ═══════════════════════════════════════════════
// PRODUCT MODAL
// ═══════════════════════════════════════════════
function openModal(productId) {
  const product = products.find((p) => p.id === productId);
  if (!product) return;

  modalBody.innerHTML = `
    <img src="${product.image}" alt="${product.name}" width="600" height="300" />
    <h2>${product.name}</h2>
    <div class="modal-price">₦${product.price.toLocaleString()}</div>
    <p>${product.desc}</p>
    <p style="color: var(--muted); font-size: 0.9rem;">Category: ${product.category.charAt(0).toUpperCase() + product.category.slice(1)}</p>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="addToCart(${product.id}); closeModal();">Add to Cart</button>
      <button class="btn btn-secondary" onclick="addToCart(${product.id}); openCart(); closeModal();">Buy Now</button>
    </div>
  `;

  modalOverlay.classList.add("open");
  productModal.classList.add("open");
  modalOverlay.setAttribute("aria-hidden", "false");
  productModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modalOverlay.classList.remove("open");
  productModal.classList.remove("open");
  modalOverlay.setAttribute("aria-hidden", "true");
  productModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", closeModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
    closeCart();
  }
});

// ═══════════════════════════════════════════════
// CART FUNCTIONS
// ═══════════════════════════════════════════════
function addToCart(productId) {
  const existing = cart.find((item) => item.id === productId);
  if (existing) {
    existing.qty += 1;
  } else {
    const product = products.find((p) => p.id === productId);
    cart.push({ ...product, qty: 1 });
  }
  saveCart();
  updateCartUI();
  animateCartCount();
}

function removeFromCart(productId) {
  cart = cart.filter((item) => item.id !== productId);
  saveCart();
  updateCartUI();
}

function changeQty(productId, delta) {
  const item = cart.find((i) => i.id === productId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    removeFromCart(productId);
    return;
  }
  saveCart();
  updateCartUI();
}

function updateCartUI() {
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  cartCount.textContent = totalItems;
  cartTotal.textContent = `₦${totalPrice.toLocaleString()}`;

  if (cart.length === 0) {
    cartItems.innerHTML = '<p class="cart-empty">Your cart is empty</p>';
    return;
  }

  cartItems.innerHTML = cart
    .map(
      (item) => `
    <div class="cart-item">
      <img src="${item.image}" alt="${item.name}" width="56" height="56" />
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">₦${item.price.toLocaleString()}</div>
      </div>
      <div class="cart-item-qty">
        <button class="qty-btn" data-id="${item.id}" data-delta="-1" aria-label="Decrease quantity">&minus;</button>
        <span class="qty-value">${item.qty}</span>
        <button class="qty-btn" data-id="${item.id}" data-delta="1" aria-label="Increase quantity">+</button>
      </div>
      <button class="cart-item-remove" data-id="${item.id}" aria-label="Remove ${item.name} from cart">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>
  `
    )
    .join("");

  cartItems.querySelectorAll(".qty-btn").forEach((btn) => {
    btn.addEventListener("click", () => changeQty(Number(btn.dataset.id), Number(btn.dataset.delta)));
  });

  cartItems.querySelectorAll(".cart-item-remove").forEach((btn) => {
    btn.addEventListener("click", () => removeFromCart(Number(btn.dataset.id)));
  });
}

function animateCartCount() {
  cartCount.classList.remove("bump");
  void cartCount.offsetWidth; // trigger reflow
  cartCount.classList.add("bump");
}

function openCart() {
  cartSidebar.classList.add("open");
  cartOverlay.classList.add("open");
  cartSidebar.setAttribute("aria-hidden", "false");
  cartOverlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeCart() {
  cartSidebar.classList.remove("open");
  cartOverlay.classList.remove("open");
  cartSidebar.setAttribute("aria-hidden", "true");
  cartOverlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

cartButton.addEventListener("click", openCart);
cartClose.addEventListener("click", closeCart);
cartOverlay.addEventListener("click", closeCart);

function goToCheckout() {
  if (cart.length === 0) {
    alert('Your cart is empty!');
    return;
  }
  saveCart();
  window.location.href = '/checkout';
}

// ═══════════════════════════════════════════════
// CATEGORY TABS
// ═══════════════════════════════════════════════
categoryTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    categoryTabs.forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    activeCategory = tab.dataset.category;
    renderProducts();
  });
});

// ═══════════════════════════════════════════════
// SEARCH & SORT
// ═══════════════════════════════════════════════
let searchDebounce;
searchInput.addEventListener("input", (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchQuery = e.target.value;
    renderProducts();
  }, 250);
});

sortSelect.addEventListener("change", (e) => {
  sortValue = e.target.value;
  renderProducts();
});

// ═══════════════════════════════════════════════
// NEWSLETTER FORM
// ═══════════════════════════════════════════════
const newsletterForm = document.getElementById("newsletterForm");
if (newsletterForm) {
  newsletterForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = newsletterForm.querySelector("input").value;
    if (email) {
      alert(`Thanks for subscribing with ${email}! You'll receive our latest deals soon.`);
      newsletterForm.reset();
    }
  });
}

// ═══════════════════════════════════════════════
// FOOTER CATEGORY LINKS
// ═══════════════════════════════════════════════
document.querySelectorAll(".footer-col a[data-category]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const category = link.dataset.category;
    // Scroll to products section
    document.getElementById("products").scrollIntoView({ behavior: "smooth" });
    // Set active category after scroll
    setTimeout(() => {
      categoryTabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
        if (t.dataset.category === category) {
          t.classList.add("active");
          t.setAttribute("aria-selected", "true");
        }
      });
      activeCategory = category;
      renderProducts();
    }, 500);
  });
});

// ═══════════════════════════════════════════════
// FOOTER YEAR
// ═══════════════════════════════════════════════
const yearElement = document.getElementById("year");
if (yearElement) {
  yearElement.textContent = new Date().getFullYear();
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
renderProducts();
initReveal();
