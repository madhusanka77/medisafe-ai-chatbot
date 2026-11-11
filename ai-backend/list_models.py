import requests


GEMINI_API_KEY = ""

def get_available_models():

    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={GEMINI_API_KEY}"
    
    print("\n🔍 Fetching available Gemini models for your API Key...\n")
    
    try:
        response = requests.get(url)
        data = response.json()
        
        if response.status_code == 200:
            models = data.get('models', [])
            print(f"{'Model Name':<40} | {'Supported Actions'}")
            print("-" * 70)
            
            for model in models:
                name = model.get('name', 'N/A').replace('models/', '')
                methods = ", ".join(model.get('supportedGenerationMethods', []))
                

                if 'generateContent' in methods:
                    print(f"{name:<40} | {methods}")
        else:
            print(f"❌ Error: {data.get('error', {}).get('message', 'Unknown error')}")
            
    except Exception as e:
        print(f"❌ System Error: {e}")

if __name__ == "__main__":
    get_available_models()