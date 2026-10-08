window.addEventListener('error', function(e) {
  fetch('http://localhost:8080/log_error', {
    method: 'POST',
    body: e.error ? e.error.stack : e.message
  });
});
window.addEventListener('unhandledrejection', function(e) {
  fetch('http://localhost:8080/log_error', {
    method: 'POST',
    body: e.reason ? e.reason.stack : e.reason
  });
});
