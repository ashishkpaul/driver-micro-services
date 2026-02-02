const bcrypt = require('bcrypt');

async function generateHash() {
  const password = 'password';
  const saltRounds = 10;
  
  const hash = await bcrypt.hash(password, saltRounds);
  console.log('Password:', password);
  console.log('Hash:', hash);
  
  // Test if it matches
  const isValid = await bcrypt.compare(password, hash);
  console.log('Valid:', isValid);
}

generateHash();