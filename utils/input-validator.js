const InputValidator = {
  branchCode: (value) => !value || /^[A-Z]{3}$/.test(value),
  
  gstin: (value) => !value || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(value),
  
  pan: (value) => !value || /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(value),
  
  aadhar: (value) => !value || /^[0-9]{12}$/.test(value),
  
  pin: (value) => !value || /^[1-9][0-9]{5}$/.test(value),
  
  email: (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  
  upi: (value) => !value || /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(value),
  
  ifsc: (value) => !value || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value),
  
  mobile: (value) => !value || /^[0-9]{7,15}$/.test(value),
  
  bankAccount: (value) => !value || /^[0-9]{9,18}$/.test(value),
  
  stateCode: (value) => !value || /^[A-Z]{2}$/.test(value),
  
  gstCode: (value) => !value || /^[0-9]{2}$/.test(value),
  
  age18: (dob) => {
    if (!dob) return true;
    const today = new Date();
    const birth = new Date(dob);
    const age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      return age - 1 >= 18;
    }
    return age >= 18;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InputValidator;
}
if (typeof window !== 'undefined') {
  window.InputValidator = InputValidator;
}
