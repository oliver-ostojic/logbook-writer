// Simple fetch test without importing any server code
const API_URL = 'http://localhost:3001';

async function test() {
  try {
    console.log('Testing endpoint: GET /stores/768/crew-with-shifts?date=2025-11-25\n');
    
    const res = await fetch(`${API_URL}/stores/768/crew-with-shifts?date=2025-11-25`);
    
    console.log('Status:', res.status);
    console.log('Status Text:', res.statusText);
    
    const data = await res.json();
    console.log('\nResponse data:');
    console.log(JSON.stringify(data, null, 2));
    console.log('\nNumber of roles:', Array.isArray(data) ? data.length : 'N/A');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
