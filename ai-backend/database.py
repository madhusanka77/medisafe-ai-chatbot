import requests

SUPABASE_URL = "https://hqdskfkakdhnboinuynm.supabase.co"
SUPABASE_KEY = "sb_publishable_HalPZL9GiIgyO_E4j3oMrQ_J8tqYvJ3"


headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}


try:
    response = requests.get(f"{SUPABASE_URL}/rest/v1/chat_history?select=*", headers=headers)
    
    if response.status_code == 200:
        print("✅ Supabase Database Connected Successfully! (via REST API) 🔥")
    else:
        print(f"❌ Connection Failed: {response.text}")
except Exception as e:
    print(f"❌ System Error: {e}")