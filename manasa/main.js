document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('slider');
    const sections = document.querySelectorAll('section');
    const dots = document.querySelectorAll('.dot');
    const navNumber = document.querySelector('.nav-number');

    // Observer for sections
    const observerOptions = {
        root: slider,
        threshold: 0.6 // Section is "active" when 60% is visible
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const index = Array.from(sections).indexOf(entry.target);
                updateUI(index);
            }
        });
    }, observerOptions);

    sections.forEach(section => observer.observe(section));

    function updateUI(index) {
        // Update Active Class
        sections.forEach((sec, i) => {
            if (i === index) sec.classList.add('active');
            else sec.classList.remove('active');
        });

        // Update Dots
        dots.forEach((dot, i) => {
            if (i === index) dot.classList.add('active');
            else dot.classList.remove('active');
        });

        // Update Nav Number
        navNumber.textContent = `0${index + 1}`.slice(-2);

        // Hide/Show Scroll Indicator on last section
        const scrollIndicator = document.querySelector('.scroll-indicator');
        if (index === sections.length - 1) {
            scrollIndicator.style.opacity = '0';
        } else {
            scrollIndicator.style.opacity = '1';
        }
    }

    // Dot Click Navigation
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            sections[index].scrollIntoView({ behavior: 'smooth' });
        });
    });

    // Logo click to top
    document.querySelector('.logo-container').addEventListener('click', () => {
        sections[0].scrollIntoView({ behavior: 'smooth' });
    });

    // Menu Logic - Toggle on menu button click
    const menuToggle = document.getElementById('menuToggle');
    const menuOverlay = document.getElementById('menuOverlay');
    const menuLinks = document.querySelectorAll('.menu-link');

    menuToggle.addEventListener('click', () => {
        menuOverlay.classList.toggle('active');
    });

    menuLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href');
            const targetEntry = document.querySelector(targetId);
            menuOverlay.classList.remove('active');
            setTimeout(() => {
                targetEntry.scrollIntoView({ behavior: 'smooth' });
            }, 300);
        });
    });

    // Unified Overlay Logic
    const projectOverlay = document.getElementById('projectOverlay');
    const projectClose = document.getElementById('projectClose');
    const categoryOverlay = document.getElementById('categoryOverlay');
    const projectDetailOverlay = document.getElementById('projectDetailOverlay');

    const categoryTitle = document.getElementById('categoryTitle');
    const categoryGrid = document.getElementById('categoryGrid');

    const projectTitle = document.getElementById('projectTitle');
    const projectImages = document.getElementById('projectImages');

    // 6 curated projects per category for non-scrollable grid
    const architectureProjects = [
        { name: "VILLA SCULPTURA", img: "assets/grid1.png" },
        { name: "MODERNIST RETREAT", img: "assets/architecture.png" },
        { name: "BRUTALIST HAVEN", img: "assets/grid2.png" },
        { name: "GLASS CANOPY", img: "assets/architecture.png" },
        { name: "URBAN LOFT", img: "assets/grid1.png" },
        { name: "THE MONOLITH", img: "assets/architecture.png" }
    ];

    const interiorProjects = [
        { name: "MINIMALIST ZEN", img: "assets/interior.png" },
        { name: "GOLDEN SUITE", img: "assets/grid2.png" },
        { name: "VELVET LOUNGE", img: "assets/interior.png" },
        { name: "MARBLE HALLS", img: "assets/grid1.png" },
        { name: "COZY ATRIUM", img: "assets/interior.png" },
        { name: "MODERN NEST", img: "assets/grid2.png" }
    ];

    function showOverlay(type, category = null) {
        projectOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Reset views
        categoryOverlay.style.display = 'none';
        projectDetailOverlay.style.display = 'none';
        const contactOverlay = document.getElementById('contactOverlay');
        if (contactOverlay) contactOverlay.style.display = 'none';

        if (type === 'category') {
            categoryOverlay.style.display = 'block';
            categoryTitle.textContent = category.toUpperCase();

            const projects = category === 'architecture' ? architectureProjects : interiorProjects;
            categoryGrid.innerHTML = projects.map((p, i) => `
                <div class="grid-item" data-project="${p.name}" data-index="${i + 1}">
                    <img src="${p.img}" alt="${p.name}">
                    <div class="shadow-overlay"></div>
                    <div class="grid-caption"><span>${p.name}</span></div>
                </div>
            `).join('');

            // Re-attach listeners to new grid items
            categoryGrid.querySelectorAll('.grid-item').forEach(item => {
                item.addEventListener('click', () => {
                    showProject(item.getAttribute('data-project'), item.querySelector('img').src);
                });
            });
        } else if (type === 'contact') {
            if (contactOverlay) contactOverlay.style.display = 'block';
        }
    }

    function showProject(name, img) {
        categoryOverlay.style.display = 'none';
        projectDetailOverlay.style.display = 'block';
        projectTitle.textContent = name;
        projectImages.innerHTML = `
            <img src="${img}" alt="${name} 1">
            <img src="assets/architecture.png" alt="${name} 2">
            <img src="assets/interior.png" alt="${name} 3">
            <img src="assets/grid1.png" alt="${name} 4">
        `;
        projectOverlay.querySelector('.overlay-section#projectDetailOverlay').scrollTo(0, 0);
    }

    // View Triggers
    document.querySelectorAll('.view-trigger').forEach(trigger => {
        trigger.addEventListener('click', () => {
            const cat = trigger.getAttribute('data-category');
            if (cat === 'architecture' || cat === 'interior') {
                showOverlay('category', cat);
            } else if (cat === 'contact') {
                showOverlay('contact');
            }
        });
    });

    projectClose.addEventListener('click', () => {
        if (projectDetailOverlay.style.display === 'block' && categoryGrid.innerHTML !== "") {
            // If in detail but came from grid, go back to grid
            projectDetailOverlay.style.display = 'none';
            categoryOverlay.style.display = 'block';
        } else {
            projectOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

});
