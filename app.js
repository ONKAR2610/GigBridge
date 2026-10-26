// 1. Initialize Supabase Connection
const SUPABASE_URL = 'https://kjpyvtbtidjvovjnkknj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqcHl2dGJ0aWRqdm92am5ra25qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MjQ0MzUsImV4cCI6MjEwNzIwMDQzNX0.qtDUqMapQ9wi0Mz8j-N2Vfsddg-A3nJhOsiwLdOOPyI';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper icon map for service categories
function getCategoryIcon(name) {
    const lower = (name || '').toLowerCase();
    if (lower.includes('plumb')) return '🚰';
    if (lower.includes('electric')) return '⚡';
    if (lower.includes('carpent')) return '🪚';
    if (lower.includes('clean')) return '🧹';
    if (lower.includes('mechan')) return '🔧';
    return '🛠️';
}

// --- POPULATE CATEGORIES ON WORKER SIGNUP & CUSTOMER DASHBOARD ---
document.addEventListener("DOMContentLoaded", async () => {
    const wCategorySelect = document.getElementById('wCategory');
    const jobCategoryGrid = document.getElementById('jobCategoryGrid');
    const jobCategoryInput = document.getElementById('jobCategory');

    if (wCategorySelect || jobCategoryGrid) {
        const { data: categories } = await db.from('service_category').select('*');
        if (categories && categories.length > 0) {
            // 1. Populate Worker Signup multi-select
            if (wCategorySelect) {
                wCategorySelect.innerHTML = categories.map(c =>
                    `<option value="${c.category_id}">${c.category_name}</option>`
                ).join('');
            }

            // 2. Populate Customer Dashboard Category Icon Tiles
            if (jobCategoryGrid && jobCategoryInput) {
                jobCategoryInput.value = categories[0].category_id;
                jobCategoryGrid.innerHTML = categories.map((c, idx) => `
                    <div class="category-tile ${idx === 0 ? 'selected' : ''}" data-id="${c.category_id}">
                        <span class="icon">${getCategoryIcon(c.category_name)}</span>
                        ${c.category_name}
                    </div>
                `).join('');

                const tiles = jobCategoryGrid.querySelectorAll('.category-tile');
                tiles.forEach(tile => {
                    tile.addEventListener('click', () => {
                        tiles.forEach(t => t.classList.remove('selected'));
                        tile.classList.add('selected');
                        jobCategoryInput.value = tile.getAttribute('data-id');
                    });
                });
            }
        }
    }
});

// --- CONSUMER SIGN UP LOGIC ---
const consumerSignupForm = document.getElementById('consumerSignupForm');
if (consumerSignupForm) {
    consumerSignupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('cName').value.trim();
        const phone = document.getElementById('cPhone').value.trim();
        const address = document.getElementById('cAddress').value.trim();
        const pincode = document.getElementById('cPincode').value.trim();
        const email = document.getElementById('cEmail').value.trim();
        const password = document.getElementById('cPassword').value;

        const { data: authData, error: authError } = await db.auth.signUp({ email, password });
        if (authError) return alert("Signup Error: " + authError.message);

        const { error } = await db.from('consumer').upsert([{ 
            consumer_id: authData.user.id, 
            name: name, 
            phone_number: phone, 
            address: address,
            pincode: pincode,
            location_zone: `${address} (${pincode})`
        }]);
        
        if (error) {
            console.error(error);
            alert("Database Error: " + error.message);
        } else {
            alert("Customer account created successfully! Routing to dashboard...");
            window.location.href = 'consumer-dashboard.html';
        }
    });
}

// --- WORKER SIGN UP LOGIC ---
const workerSignupForm = document.getElementById('workerSignupForm');
if (workerSignupForm) {
    workerSignupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('wName').value.trim();
        const phone = document.getElementById('wPhone').value.trim();
        const address = document.getElementById('wAddress').value.trim();
        const pincode = document.getElementById('wPincode').value.trim();
        const categorySelect = document.getElementById('wCategory');
        const selectedCategoryIds = Array.from(categorySelect.selectedOptions).map(opt => opt.value);
        const email = document.getElementById('wEmail').value.trim();
        const password = document.getElementById('wPassword').value;

        const { data: authData, error: authError } = await db.auth.signUp({ email, password });
        if (authError) return alert("Signup Error: " + authError.message);

        const { error } = await db.from('worker').upsert([{ 
            worker_id: authData.user.id, 
            name: name, 
            phone_number: phone,
            address: address,
            pincode: pincode,
            availability_status: 'Offline',
            category_ids: selectedCategoryIds 
        }]);
        
        if (error) {
            console.error(error);
            alert("Database Error: " + error.message);
        } else {
            alert("Worker account created successfully! Routing to dashboard...");
            window.location.href = 'worker-dashboard.html';
        }
    });
}

// --- LOGIN LOGIC ---
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) return alert("Login Error: " + error.message);

        const userId = data.user.id;
        
        const { data: consumer } = await db.from('consumer').select('consumer_id').eq('consumer_id', userId).maybeSingle();
        if (consumer) {
            window.location.href = 'consumer-dashboard.html';
        } else {
            window.location.href = 'worker-dashboard.html';
        }
    });
}

// --- LOGOUT LOGIC ---
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        await db.auth.signOut();
        window.location.href = 'index.html';
    });
}

// --- CONSUMER: SUBMIT JOB REQUEST (BROADCASTS CUSTOMER PINCODE & ADDRESS) ---
const jobRequestForm = document.getElementById('jobRequestForm');
if (jobRequestForm) {
    jobRequestForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const desc = document.getElementById('jobDesc').value.trim();
        const categoryId = document.getElementById('jobCategory').value;
        
        const { data: { user } } = await db.auth.getUser();
        if (!user) return alert("Please log in first.");

        const { data: customerProfile } = await db.from('consumer')
            .select('address, pincode')
            .eq('consumer_id', user.id)
            .maybeSingle();

        if (!customerProfile || !customerProfile.pincode) {
            return alert("Please click 'My Profile' and save your Complete Address and 6-digit Pincode before broadcasting a job.");
        }

        const { error } = await db.from('job_request').insert([{ 
            description: desc, 
            job_status: 'Open', 
            consumer_id: user.id,
            category_id: categoryId || null,
            pincode: customerProfile.pincode.trim(),
            address: customerProfile.address || ''
        }]);

        if (error) {
            alert("Error broadcasting job: " + error.message);
        } else {
            const output = document.getElementById('jobStatusOutput');
            if (output) {
                output.style.display = 'block';
                output.innerHTML = `<strong>Success!</strong> Your request for <em>"${desc}"</em> has been broadcasted to available workers in Pincode <strong>${customerProfile.pincode}</strong>.`;
            }
            document.getElementById('jobDesc').value = ''; 
            loadJobHistory(); 
        }
    });
}

// --- WORKER DASHBOARD: LIVE FEED, PROFILE CARD & STATUS LOGIC ---
const toggleStatusBtn = document.getElementById('toggleStatusBtn');
const jobFeed = document.getElementById('jobFeed');
let isOnline = false;

async function refreshWorkerSummaryCard() {
    const nameEl = document.getElementById('workerDisplayName');
    const skillsEl = document.getElementById('workerDisplaySkills');
    const pincodeEl = document.getElementById('workerDisplayPincode');
    const statusEl = document.getElementById('workerDisplayStatus');
    const badgeEl = document.getElementById('onlineBadge');
    if (!nameEl) return;

    const { data: { user } } = await db.auth.getUser();
    if (!user) return;

    const { data: worker } = await db.from('worker').select('*').eq('worker_id', user.id).maybeSingle();
    const { data: categories } = await db.from('service_category').select('*');

    if (worker) {
        nameEl.innerText = worker.name || 'Worker';
        const catMap = {};
        if (categories) categories.forEach(c => catMap[c.category_id] = c.category_name);
        const skillNames = (worker.category_ids || []).map(id => catMap[id] || id);
        skillsEl.innerText = skillNames.length > 0 ? skillNames.join(' & ') : 'No skills selected';

        if (pincodeEl) {
            pincodeEl.innerText = worker.pincode ? `${worker.pincode} (${worker.address || ''})` : 'Not set';
        }

        const online = worker.availability_status === 'Open';
        statusEl.innerText = online ? 'Online' : 'Offline';
        statusEl.style.color = online ? '#2ecc71' : '#e74c3c';

        if (badgeEl) {
            badgeEl.innerText = online ? '● ONLINE' : '● OFFLINE';
            badgeEl.className = online ? 'online-pill' : 'online-pill offline';
        }
    }
}

if (toggleStatusBtn && jobFeed) {
    document.addEventListener("DOMContentLoaded", async () => {
        const { data: { user } } = await db.auth.getUser();
        if (!user) return;

        await refreshWorkerSummaryCard();

        const { data: worker } = await db.from('worker').select('availability_status').eq('worker_id', user.id).maybeSingle();
        if (worker && worker.availability_status === 'Open') {
            isOnline = true;
            updateButtonUI();
            window.fetchAvailableJobs();
        }
    });

    toggleStatusBtn.addEventListener('click', async () => {
        const { data: { user } } = await db.auth.getUser();
        if (!user) return alert("Please log in first.");

        isOnline = !isOnline;
        const newStatus = isOnline ? 'Open' : 'Offline';
        const { error } = await db.from('worker').update({ availability_status: newStatus }).eq('worker_id', user.id);
        
        if (error) return alert("Status update failed: " + error.message);
        
        updateButtonUI();
        await refreshWorkerSummaryCard();
        
        if (isOnline) {
            window.fetchAvailableJobs();
        } else {
            jobFeed.innerHTML = "<div class='card'>You are currently offline. Click 'Go Online' to see local job requests in your pincode.</div>";
        }
    });

    function updateButtonUI() {
        toggleStatusBtn.innerText = isOnline ? "Go Offline" : "Go Online";
        toggleStatusBtn.style.backgroundColor = isOnline ? "#c0392b" : "#e67e22";
    }

    // Matches Open jobs by BOTH Worker's Skill Category AND Worker's Pincode
    window.fetchAvailableJobs = async function() {
        jobFeed.innerHTML = "<div class='card'>Searching for matching jobs in your pincode...</div>";
        
        const { data: { user } } = await db.auth.getUser();
        if (!user) return;
        
        const { data: workerProfile, error: profileError } = await db.from('worker')
            .select('category_ids, pincode') 
            .eq('worker_id', user.id)
            .maybeSingle();

        if (profileError || !workerProfile || !workerProfile.category_ids || workerProfile.category_ids.length === 0) {
            jobFeed.innerHTML = `<div class="card" style="border-left: 5px solid #e74c3c;">Please click <strong>Edit Profile & Skills</strong> to select at least one service category.</div>`;
            return;
        }

        if (!workerProfile.pincode) {
            jobFeed.innerHTML = `<div class="card" style="border-left: 5px solid #e74c3c;">Please click <strong>Edit Profile & Skills</strong> to set your 6-digit Service Pincode so we can match local jobs.</div>`;
            return;
        }

        const { data: categories } = await db.from('service_category').select('*');
        const catMap = {};
        if (categories) categories.forEach(c => catMap[c.category_id] = c.category_name);

        const { data: jobs, error } = await db.from('job_request')
            .select('*')
            .eq('job_status', 'Open')
            .eq('pincode', workerProfile.pincode.trim())
            .in('category_id', workerProfile.category_ids);
        
        if (error) {
            jobFeed.innerHTML = `<div class="card" style="color:red;">Error loading jobs: ${error.message}</div>`;
            return;
        }

        if (jobs.length === 0) {
            jobFeed.innerHTML = `<div class='card'><strong>Status: Online (Pincode: ${workerProfile.pincode})</strong><br>Actively listening. No open jobs in pincode <strong>${workerProfile.pincode}</strong> match your skills right now.</div>`;
            return;
        }

        jobFeed.innerHTML = jobs.map(job => `
            <div class="card" id="job-card-${job.job_id}" style="border-left: 5px solid #2ecc71;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span class="badge" style="background: #1b263b;">${catMap[job.category_id] || 'Service Request'}</span>
                    <span class="badge new">PINCODE: ${job.pincode}</span>
                </div>
                <h3 style="margin-bottom: 6px;">${job.description}</h3>
                <p style="font-size: 14px; color: #444; margin-bottom: 6px;"><strong>Customer Address:</strong> ${job.address || 'Address provided'}</p>
                <p style="font-size: 12px; color: #888; margin-bottom: 15px;">Job ID: ${job.job_id.substring(0, 8)}...</p>
                
                <div style="display: flex; gap: 10px;">
                    <button class="btn worker-btn" onclick="acceptJob('${job.job_id}')">Accept Job</button>
                    <button class="btn btn-danger" onclick="declineJob('${job.job_id}')">Decline</button>
                </div>
            </div>
        `).join('');
    };
<<<<<<< HEAD
=======

    // Live Updates using Supabase Realtime
    db.channel('public:job_request')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_request' }, () => {
          if (isOnline && typeof window.fetchAvailableJobs === "function") {
              window.fetchAvailableJobs(); 
          }
          loadJobHistory();
      })
      .subscribe();
>>>>>>> 9724060dc33f5ac885a06aafc498de458f33252c
}

// --- WORKER ACTIONS: ACCEPT & DECLINE ---
window.acceptJob = async function(jobId) {
    const { data: { user } } = await db.auth.getUser();
    
    const { error } = await db.from('job_request')
        .update({ 
            job_status: 'Assigned', 
            worker_id: user.id 
        })
        .eq('job_id', jobId);
        
    if (error) {
        alert("Error accepting job: " + error.message);
    } else {
<<<<<<< HEAD
        alert("Job Accepted successfully! You can now view the customer's contact details in your job history.");
=======
        alert("Job Accepted successfully!");
>>>>>>> 9724060dc33f5ac885a06aafc498de458f33252c
        if (typeof window.fetchAvailableJobs === "function") window.fetchAvailableJobs(); 
        loadJobHistory(); 
    }
};

window.declineJob = function(jobId) {
    const jobCard = document.getElementById(`job-card-${jobId}`);
    if (jobCard) {
        jobCard.style.display = 'none';
    }
};

// --- MODAL TOGGLE & PROFILE MANAGEMENT LOGIC ---
const profileModal = document.getElementById('profileModal');
const openProfileBtn = document.getElementById('openProfileBtn');
const editSkillsBtn = document.getElementById('editSkillsBtn');
const closeProfileBtn = document.getElementById('closeProfileBtn');
const profileForm = document.getElementById('profileForm');

function openProfileModal() {
    if (profileModal) {
        profileModal.style.display = 'flex';
        loadUserProfile();
    }
}

if (openProfileBtn) openProfileBtn.addEventListener('click', openProfileModal);
if (editSkillsBtn) editSkillsBtn.addEventListener('click', openProfileModal);

if (closeProfileBtn && profileModal) {
    closeProfileBtn.addEventListener('click', () => {
        profileModal.style.display = 'none';
    });
    window.addEventListener('click', (e) => {
        if (e.target === profileModal) profileModal.style.display = 'none';
    });
}

async function loadUserProfile() {
    if (!profileForm) return;

    const { data: { user } } = await db.auth.getUser();
    if (!user) return;

    const { data: consumer } = await db.from('consumer').select('*').eq('consumer_id', user.id).maybeSingle();
    const { data: worker } = await db.from('worker').select('*').eq('worker_id', user.id).maybeSingle();

<<<<<<< HEAD
    const extraField = document.getElementById('extraProfileField') || document.getElementById('workerSkillsField');
    const isWorkerPage = window.location.pathname.includes('worker-dashboard') || !!extraField;
=======
    // Determine role by database record or current dashboard page
    const isWorkerPage = window.location.pathname.includes('worker-dashboard') || !!document.getElementById('extraProfileField');
>>>>>>> 9724060dc33f5ac885a06aafc498de458f33252c
    const profileData = isWorkerPage ? (worker || consumer) : (consumer || worker);

    if (profileData) {
        document.getElementById('profileName').value = profileData.name || '';
        document.getElementById('profilePhone').value = profileData.phone_number || '';
        document.getElementById('profileAddress').value = profileData.address || profileData.location_zone || '';
        document.getElementById('profilePincode').value = profileData.pincode || '';
    }

    // Populate multi-select skills ONLY on the Worker Dashboard
<<<<<<< HEAD
=======
    const extraField = document.getElementById('extraProfileField');
>>>>>>> 9724060dc33f5ac885a06aafc498de458f33252c
    if (extraField) {
        const { data: categories } = await db.from('service_category').select('*');
        const userCategories = (profileData && profileData.category_ids) ? profileData.category_ids : []; 
        
        let options = (categories || []).map(c => 
            `<option value="${c.category_id}" ${userCategories.includes(c.category_id) ? 'selected' : ''}>${c.category_name}</option>`
        ).join('');
        
        extraField.innerHTML = `
            <label>Services Offered (Hold Ctrl/Cmd to select multiple): 
                <select id="profileCategory" multiple required>${options}</select>
            </label>`;
    }
}

// Top-level submit listener guarantees Save Changes always fires, alerts, and closes the modal
if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const { data: { user } } = await db.auth.getUser();
        if (!user) {
            alert("Your session has expired. Please log in again.");
            window.location.href = 'login.html';
            return;
        }

        const name = document.getElementById('profileName').value.trim();
        const phone = document.getElementById('profilePhone').value.trim();
        const address = document.getElementById('profileAddress').value.trim();
        const pincode = document.getElementById('profilePincode').value.trim();

<<<<<<< HEAD
        const extraField = document.getElementById('extraProfileField') || document.getElementById('workerSkillsField');
        const isWorkerDashboard = !!extraField;

        if (!isWorkerDashboard) {
            // Save Customer Profile
=======
        const extraField = document.getElementById('extraProfileField');
        const isWorkerDashboard = !!extraField;

        if (!isWorkerDashboard) {
            // Save Customer Profile (No services offered field)
>>>>>>> 9724060dc33f5ac885a06aafc498de458f33252c
            const { error } = await db.from('consumer').upsert([{ 
                consumer_id: user.id,
                name: name, 
                phone_number: phone, 
                address: address,
                pincode: pincode,
                location_zone: `${address} (${pincode})`
            }]);

            if (error) {
                alert("Error saving customer profile: " + error.message);
            } else {
                alert("Customer profile saved successfully!");
                if (profileModal) profileModal.style.display = 'none';
            }
        } else {
            // Save Worker Profile & Skills
            const categorySelect = document.getElementById('profileCategory');
            const selectedCategoryIds = categorySelect ? Array.from(categorySelect.selectedOptions).map(opt => opt.value) : [];
            
            const { error } = await db.from('worker').upsert([{ 
                worker_id: user.id,
                name: name, 
                phone_number: phone, 
                address: address,
                pincode: pincode,
                category_ids: selectedCategoryIds 
            }]);

            if (error) {
                alert("Error saving worker profile: " + error.message);
            } else { 
                alert("Worker profile saved successfully!"); 
                if (profileModal) profileModal.style.display = 'none';
                await refreshWorkerSummaryCard();
                if (isOnline && typeof window.fetchAvailableJobs === "function") {
                    window.fetchAvailableJobs(); 
                }
            }
        }
    });
}

<<<<<<< HEAD
// --- UNIFIED JOB HISTORY, TWO-WAY CONTACT INFO & CLOSE JOB LOGIC ---
=======
// --- UNIFIED JOB HISTORY & STATUS FILTER TRACKER ---
const historyFilterSelect = document.getElementById('historyFilterSelect');
if (historyFilterSelect) {
    historyFilterSelect.addEventListener('change', () => {
        loadJobHistory();
    });
}

>>>>>>> 9724060dc33f5ac885a06aafc498de458f33252c
async function loadJobHistory() {
    const historyContainer = document.getElementById('jobHistoryFeed');
    if (!historyContainer) return; 

    const { data: { user } } = await db.auth.getUser();
    if (!user) return;

<<<<<<< HEAD
    // 1. Determine whether current view is Customer Dashboard or Worker Dashboard
    const { data: consumer } = await db.from('consumer').select('consumer_id').eq('consumer_id', user.id).maybeSingle();
    const isWorkerDashboard = !!document.getElementById('toggleStatusBtn');
    const isConsumer = !isWorkerDashboard && !!consumer;
    const roleColumn = isConsumer ? 'consumer_id' : 'worker_id';

    // 2. Fetch jobs with relational join for Category, Accepted Worker, and Customer details
    let query = db.from('job_request')
        .select(`
            *,
            service_category ( category_name ),
            worker ( name, phone_number ),
            consumer ( name, phone_number, address, pincode )
        `)
        .eq(roleColumn, user.id)
        .order('job_id', { ascending: false });

    // 3. Apply status filter if selected on Customer Dashboard
    const filterSelect = document.getElementById('historyFilterSelect');
    if (isConsumer && filterSelect && filterSelect.value !== 'All') {
=======
    const { data: consumer } = await db.from('consumer').select('consumer_id').eq('consumer_id', user.id).maybeSingle();
    const isWorkerDashboard = !!document.getElementById('toggleStatusBtn');
    const roleColumn = (!isWorkerDashboard && consumer) ? 'consumer_id' : 'worker_id';

    const { data: categories } = await db.from('service_category').select('*');
    const catMap = {};
    if (categories) categories.forEach(c => catMap[c.category_id] = c.category_name);

    let query = db.from('job_request')
        .select('*')
        .eq(roleColumn, user.id)
        .order('job_status', { ascending: false });

    // Apply status filter if selected on Customer Dashboard
    const filterSelect = document.getElementById('historyFilterSelect');
    if (filterSelect && filterSelect.value !== 'All') {
>>>>>>> 9724060dc33f5ac885a06aafc498de458f33252c
        query = query.eq('job_status', filterSelect.value);
    }

    const { data: jobs, error } = await query;

    if (error) {
        historyContainer.innerHTML = `<div class="card" style="color: red;">Error loading history: ${error.message}</div>`;
        return;
    }

    if (!jobs || jobs.length === 0) {
        const activeFilter = (filterSelect && filterSelect.value !== 'All') ? ` with status "${filterSelect.value}"` : '';
        historyContainer.innerHTML = `<div class="card" style="color: #666;">No jobs found${activeFilter}.</div>`;
        return;
    }

<<<<<<< HEAD
    // 4. Render Job History Cards with Contact Info & Action Buttons
    historyContainer.innerHTML = jobs.map(job => {
        const statusLower = (job.job_status || 'Open').toLowerCase();
        const catName = job.service_category?.category_name || 'Service';

        // Contact Info Box for Customer (shows Accepted Worker's Name & Phone)
        let contactDetailsHTML = '';
        if (isConsumer && (job.job_status === 'Assigned' || job.job_status === 'Completed') && job.worker) {
            contactDetailsHTML = `
                <div class="contact-info-box" style="margin-top: 12px; padding: 12px 15px; background-color: #eef6ff; border-left: 4px solid #3498db; border-radius: 6px; font-size: 14px; color: #1b263b; line-height: 1.6;">
                    <strong>👷 Accepted Worker Contact Info:</strong><br>
                    <strong>Name:</strong> ${job.worker.name}<br>
                    <strong>Phone:</strong> <a href="tel:${job.worker.phone_number}" style="color: #e67e22; font-weight: bold; text-decoration: none;">${job.worker.phone_number}</a> (Click to Call)
                </div>
            `;
        }

        // Contact Info Box for Worker (shows Customer's Name, Phone & Address)
        if (!isConsumer && (job.job_status === 'Assigned' || job.job_status === 'Completed') && job.consumer) {
            contactDetailsHTML = `
                <div class="contact-info-box" style="margin-top: 12px; padding: 12px 15px; background-color: #eef6ff; border-left: 4px solid #3498db; border-radius: 6px; font-size: 14px; color: #1b263b; line-height: 1.6;">
                    <strong>🏠 Customer Contact Info:</strong><br>
                    <strong>Name:</strong> ${job.consumer.name}<br>
                    <strong>Phone:</strong> <a href="tel:${job.consumer.phone_number}" style="color: #e67e22; font-weight: bold; text-decoration: none;">${job.consumer.phone_number}</a> (Click to Call)<br>
                    <strong>Address:</strong> ${job.address || job.consumer.address} (Pincode: ${job.pincode || job.consumer.pincode})
                </div>
            `;
        }

        // Customer Action: Close / Cancel Job button (available if Open or Assigned)
        let actionButtonsHTML = '';
        if (isConsumer && (job.job_status === 'Open' || job.job_status === 'Assigned')) {
            actionButtonsHTML = `
                <div style="margin-top: 12px;">
                    <button onclick="closeJobRequest('${job.job_id}')" class="btn btn-danger" style="padding: 8px 16px; font-size: 13px; background-color: #e74c3c; color: white; border: none; border-radius: 6px; cursor: pointer;">
                        ✖ Close / Cancel Job
                    </button>
                </div>
            `;
        }

        // Worker Action: Mark as Completed button (available if Assigned)
        if (!isConsumer && job.job_status === 'Assigned') {
            actionButtonsHTML = `
                <div style="margin-top: 12px;">
                    <button onclick="updateJobStatus('${job.job_id}', 'Completed')" class="btn worker-btn" style="padding: 8px 16px; font-size: 13px; width: auto;">
                        ✔ Mark as Completed
                    </button>
                </div>
            `;
        }

=======
    historyContainer.innerHTML = jobs.map(job => {
        const statusLower = (job.job_status || 'open').toLowerCase();
        const catName = catMap[job.category_id] || 'Service';
>>>>>>> 9724060dc33f5ac885a06aafc498de458f33252c
        return `
            <div class="history-card ${statusLower}">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <p style="font-size: 16px;"><strong>${catName}:</strong> ${job.description}</p>
                    <span class="status-badge ${statusLower}">${job.job_status}</span>
                </div>
                <p style="font-size: 13px; color: #555; margin-top: 6px;">
                    <strong>Address:</strong> ${job.address || 'N/A'} | <strong>Pincode:</strong> ${job.pincode || 'N/A'}
                </p>
                <p style="font-size: 12px; color: #888; margin-top: 4px;">Job ID: ${job.job_id.substring(0, 8)}...</p>
                
<<<<<<< HEAD
                ${contactDetailsHTML}
                ${actionButtonsHTML}
=======
                ${job.job_status === 'Assigned' && isWorkerDashboard ? 
                    `<button onclick="updateJobStatus('${job.job_id}', 'Completed')" class="btn worker-btn" style="padding: 8px 16px; margin-top: 12px; font-size: 13px;">Mark as Completed</button>` 
                : ''}
>>>>>>> 9724060dc33f5ac885a06aafc498de458f33252c
            </div>
        `;
    }).join('');
}

<<<<<<< HEAD
// --- CUSTOMER ACTION: CLOSE / CANCEL JOB REQUEST ---
window.closeJobRequest = async function(jobId) {
    const confirmCancel = confirm("Are you sure you want to close/cancel this job request?");
    if (!confirmCancel) return;

    const { error } = await db.from('job_request')
        .update({ job_status: 'Closed' })
        .eq('job_id', jobId);

    if (error) {
        alert("Error closing job: " + error.message);
    } else {
        alert("Job request has been closed.");
        loadJobHistory(); 
    }
};

// --- WORKER ACTION: UPDATE JOB STATUS (E.G., COMPLETED) ---
=======
>>>>>>> 9724060dc33f5ac885a06aafc498de458f33252c
window.updateJobStatus = async function(jobId, newStatus) {
    const { error } = await db.from('job_request')
        .update({ job_status: newStatus })
        .eq('job_id', jobId);
        
    if (error) {
        alert("Error updating job: " + error.message);
    } else {
        loadJobHistory(); 
    }
};

<<<<<<< HEAD
// --- INITIALIZE JOB HISTORY, FILTER LISTENER & REAL-TIME SYNC ---
document.addEventListener("DOMContentLoaded", () => {
    loadJobHistory();

    const historyFilterSelect = document.getElementById('historyFilterSelect');
    if (historyFilterSelect) {
        historyFilterSelect.addEventListener('change', () => {
            loadJobHistory();
        });
    }

    // Real-time listener for both Customer & Worker dashboards
    db.channel('public:job_request_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'job_request' }, () => {
            loadJobHistory();
            if (isOnline && typeof window.fetchAvailableJobs === "function") {
                window.fetchAvailableJobs();
            }
        })
        .subscribe();
=======
document.addEventListener("DOMContentLoaded", () => {
    loadJobHistory();
>>>>>>> 9724060dc33f5ac885a06aafc498de458f33252c
});