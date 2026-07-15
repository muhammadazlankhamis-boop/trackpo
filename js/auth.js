// ===== TRACKPO — AUTH =====

// Semak session — redirect kalau tak login
async function requireAuth() {
  const { data: { session } } = await sbClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

// Ambil profile user semasa
async function getCurrentProfile() {
  const { data: { session } } = await sbClient.auth.getSession();
  if (!session) return null;

  const { data: profile } = await sbClient
    .from('profiles')
    .select('*, clients(*)')
    .eq('id', session.user.id)
    .single();

  return profile;
}

// Semak role — redirect kalau salah halaman
async function requireRole(expectedRole) {
  const profile = await getCurrentProfile();
  if (!profile) {
    window.location.href = 'login.html';
    return null;
  }

  if (profile.role !== expectedRole) {
    if (profile.role === 'admin') {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'index.html';
    }
    return null;
  }

  return profile;
}

// Logout
async function logout() {
  await sbClient.auth.signOut();
  window.location.href = 'login.html';
}

// Update last login
async function updateLastLogin(userId) {
  await sbClient
    .from('profiles')
    .update({ last_login: new Date().toISOString() })
    .eq('id', userId);
}

// Create client user (admin je boleh)
async function createClientUser(email, password, clientId, nama) {
  // Kalau email takde @, jadikan username@trackpo.app
  const finalEmail = email.includes('@') ? email : `${email}@trackpo.app`;

  const { data, error } = await sbClient.auth.admin.createUser({
    email: finalEmail,
    password: password,
    email_confirm: true
  });

  if (error) return { error };

  // Insert profile
  const { error: profileError } = await sbClient
    .from('profiles')
    .insert({
      id: data.user.id,
      email: finalEmail,
      role: 'client',
      client_id: clientId,
      nama: nama
    });

  if (profileError) return { error: profileError };

  return { data };
}

// Log activity
async function logActivity(userId, clientId, actionType, description, metadata = {}) {
  await sbClient
    .from('activity_log')
    .insert({
      user_id: userId,
      client_id: clientId,
      action_type: actionType,
      description: description,
      metadata: metadata
    });
}
