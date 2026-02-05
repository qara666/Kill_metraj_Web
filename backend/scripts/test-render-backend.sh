#!/bin/bash
# Diagnostic script to test Render backend deployment

BACKEND_URL="https://yapiko-auto-km-backend.onrender.com"

echo "=== Render Backend Diagnostic ==="
echo "Backend URL: $BACKEND_URL"
echo ""

echo "1. Testing health endpoint..."
curl -s -w "\nHTTP Status: %{http_code}\n" "$BACKEND_URL/api/health" | head -5
echo ""

echo "2. Testing login endpoint..."
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"adminpassword123"}')
HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -1)
BODY=$(echo "$LOGIN_RESPONSE" | head -n -1)

echo "HTTP Status: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ]; then
  echo "Login successful!"
  ACCESS_TOKEN=$(echo "$BODY" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
  echo "Access token obtained: ${ACCESS_TOKEN:0:20}..."
  
  echo ""
  echo "3. Testing /api/users with auth token..."
  curl -s -w "\nHTTP Status: %{http_code}\n" "$BACKEND_URL/api/users?limit=5" \
    -H "Authorization: Bearer $ACCESS_TOKEN" | head -10
else
  echo "Login failed!"
  echo "$BODY" | head -5
fi

echo ""
echo "4. Testing /api/dashboard/latest..."
curl -s -w "\nHTTP Status: %{http_code}\n" "$BACKEND_URL/api/dashboard/latest" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | head -10

echo ""
echo "5. Testing /api/debug/fetcher (Diagnostics)..."
curl -s -w "\nHTTP Status: %{http_code}\n" "$BACKEND_URL/api/debug/fetcher" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | head -20

echo ""
echo "6. Testing /api/users without auth (should return 401)..."
curl -s -w "\nHTTP Status: %{http_code}\n" "$BACKEND_URL/api/users" | head -5

echo ""
echo "=== Diagnostic Complete ==="
