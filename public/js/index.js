document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('loginButton');
    const loadingSpinner = document.getElementById('loadingSpinner'); // Optionally, for showing loading state

    // Validate input fields before submitting
    function validateForm(username, password) {
        if (!username || !password) {
            alert('Please fill out both username and password');
            return false;
        }
        return true;
    }

    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();

        const username = usernameInput.value;
        const password = passwordInput.value;

        // Validate username and password
        if (!validateForm(username, password)) return;

        console.log('Attempting login with username:', username);

        // Show loading spinner while request is in progress (optional)
        if (loadingSpinner) loadingSpinner.style.display = 'block';

        fetch('/api/login', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        })
        .then(response => {
            console.log('Login response status:', response.status);
            if (!response.ok) {
                throw new Error('Network response was not ok ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            console.log('Login response data:', data);
            if (data.success) {
                console.log('Login successful');
                
                // Clear the form upon successful login (optional)
                usernameInput.value = '';
                passwordInput.value = '';

                // Redirect to another page after successful login
                window.location.replace('fit_calculator.html'); // Use replace to avoid the user going back to the login page
            } else {
                throw new Error(data.message || 'Login failed');
            }
        })
        .catch(error => {
            console.error('Login error:', error);
            alert('Login failed: ' + error.message);
        })
        .finally(() => {
            // Hide the loading spinner after the request is done (optional)
            if (loadingSpinner) loadingSpinner.style.display = 'none';
        });
    });
});