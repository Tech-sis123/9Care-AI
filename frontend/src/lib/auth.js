export const setPatientAuth = (accessToken, refreshToken, patient) => {
  // Fresh login: ask "Have you delivered?" and for her WhatsApp number again (both are dismissed per login)
  if (!localStorage.getItem('mc_patient_token')) {
    sessionStorage.removeItem('mc_delivery_prompt_dismissed');
    sessionStorage.removeItem('mc_whatsapp_prompt_dismissed');
    sessionStorage.removeItem('mc_dob_prompt_dismissed');
  }
  localStorage.setItem('mc_patient_token', accessToken);
  localStorage.setItem('mc_patient_refresh', refreshToken);
  localStorage.setItem('mc_patient_id', patient.id);
  localStorage.setItem('mc_patient', JSON.stringify(patient));
};

export const setDoctorAuth = (accessToken, refreshToken, doctor) => {
  localStorage.setItem('mc_doctor_token', accessToken);
  localStorage.setItem('mc_doctor_refresh', refreshToken);
  localStorage.setItem('mc_doctor', JSON.stringify(doctor));
};

export const getPatientToken = () => localStorage.getItem('mc_patient_token');
export const getDoctorToken = () => localStorage.getItem('mc_doctor_token');
export const getPatientId = () => localStorage.getItem('mc_patient_id');
export const getPatientData = () => JSON.parse(localStorage.getItem('mc_patient') || 'null');
export const getDoctorData = () => JSON.parse(localStorage.getItem('mc_doctor') || 'null');

export const clearPatientAuth = () => {
  ['mc_patient_token', 'mc_patient_refresh', 'mc_patient_id', 'mc_patient'].forEach(k =>
    localStorage.removeItem(k)
  );
  sessionStorage.removeItem('mc_delivery_prompt_dismissed');
  sessionStorage.removeItem('mc_whatsapp_prompt_dismissed');
};

export const clearDoctorAuth = () => {
  ['mc_doctor_token', 'mc_doctor_refresh', 'mc_doctor'].forEach(k =>
    localStorage.removeItem(k)
  );
};

export const isPatientAuthenticated = () => !!localStorage.getItem('mc_patient_token');
export const isDoctorAuthenticated = () => !!localStorage.getItem('mc_doctor_token');
