from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import requests
import json

# ==========================================

# ==========================================
GEMINI_API_KEY = ""
SUPABASE_URL = "https://hqdskfkakdhnboinuynm.supabase.co"
SUPABASE_KEY = "sb_publishable_HalPZL9GiIgyO_E4j3oMrQ_J8tqYvJ3"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data Models ---
class ChatInput(BaseModel):
    message: str
    file_data: Optional[str] = None
    mime_type: Optional[str] = None

class FeedbackInput(BaseModel):
    review_text: str

class FeedbackUpdate(BaseModel):
    action_taken: str


@app.post("/api/chat")
async def chat_bot(data: ChatInput):
    user_text = data.message
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
        

        system_prompt = f"""
        You are 'MediBot AI', a professional medical assistant. 
        Important Rules:
        1. Respond in the EXACT language the patient uses.
        2. If the user sends a medical report (Image, PDF, or Document), analyze it carefully and explain the results simply.
        3. Keep responses short (max 2-3 sentences).
        4. 🚨 ACTION TRIGGER: If the user explicitly asks to book an appointment, channel a doctor, or schedule a visit, you MUST include the exact tag [ACTION: BOOK_APPOINTMENT] anywhere in your response.
        5. 🚨 RISK ASSESSMENT: You MUST assess the medical urgency of the patient's condition based on their message. Append exactly ONE of these tags at the very end of your response: [RISK: LOW], [RISK: NORMAL], or [RISK: HIGH].
           - [RISK: HIGH] -> For emergencies, severe pain, heavy bleeding, chest pain, breathing issues, etc.
           - [RISK: NORMAL] -> For mild symptoms like a common cold, mild fever, or general health questions.
           - [RISK: LOW] -> For basic inquiries, greetings, or simply asking to analyze a normal report.
        Patient says: {user_text}
        """

        parts = [{"text": system_prompt}]
        
        if data.file_data and data.mime_type:
            parts.append({
                "inline_data": {
                    "mime_type": data.mime_type,
                    "data": data.file_data
                }
            })

        payload = {"contents": [{"parts": parts}]}
        
        response = requests.post(url, json=payload)
        gemini_data = response.json()

        if 'candidates' in gemini_data and gemini_data['candidates']:
            ai_reply = gemini_data['candidates'][0]['content']['parts'][0]['text']
        else:
            print("🚨 Chat API Error:", gemini_data)
            ai_reply = "මට පොඩි ප්‍රශ්නයක් ආවා. කරුණාකර නැවත උත්සාහ කරන්න."


        risk_level = "Normal" # Default
        if "[RISK: HIGH]" in ai_reply:
            risk_level = "High"
            ai_reply = ai_reply.replace("[RISK: HIGH]", "").strip()
        elif "[RISK: LOW]" in ai_reply:
            risk_level = "Low"
            ai_reply = ai_reply.replace("[RISK: LOW]", "").strip()
        elif "[RISK: NORMAL]" in ai_reply:
            risk_level = "Normal"
            ai_reply = ai_reply.replace("[RISK: NORMAL]", "").strip()

        db_data = {
            "session_id": "test_user_001",
            "user_message": user_text + (" [File Attached]" if data.file_data else ""),
            "bot_response": ai_reply,
            "message_type": "file" if data.file_data else "text",
            "risk_level": risk_level #
        }
        
        headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}
        requests.post(f"{SUPABASE_URL}/rest/v1/chat_history", headers=headers, json=db_data)

        return {"response": ai_reply, "status": "success"}
        
    except Exception as e:
        print(f"❌ Chat Error: {e}")
        return {"response": "System is busy right now.", "status": "error"}

# ==========================================
# 3. FEEDBACK CRUD OPERATIONS 🚀
# ==========================================
headers_db = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}


@app.post("/api/feedback")
async def save_feedback(request: Request):
    try:
        raw_data = await request.json()
        review_text = raw_data.get("review_text") or raw_data.get("message") or raw_data.get("comment") or "No text provided"


        analysis_prompt = f"""
        Analyze this hospital feedback: "{review_text}"
        IMPORTANT RULE: If the feedback is Negative, the "action" MUST start with "Notify Pharmacy Manager: " followed by a short action.
        Return ONLY a JSON object: {{"sentiment": "Positive" or "Negative" or "Neutral", "action": "one short suggestion"}}
        """
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
        payload = {"contents": [{"parts": [{"text": analysis_prompt}]}]}
        response = requests.post(url, json=payload)
        
        raw_ai_response = response.json()['candidates'][0]['content']['parts'][0]['text']
        clean_json = raw_ai_response.strip().replace('```json', '').replace('```', '')
        analysis = json.loads(clean_json)

        fb_db_data = {
            "review_text": review_text,
            "sentiment": analysis.get('sentiment', 'Neutral'),
            "action_taken": analysis.get('action', 'Monitor feedback')
        }
        
        requests.post(f"{SUPABASE_URL}/rest/v1/feedback_logs", headers=headers_db, json=fb_db_data)

        return {"status": "success", "received_as": review_text, "analysis": analysis}

    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/feedbacks")
def get_all_feedbacks():
    res = requests.get(f"{SUPABASE_URL}/rest/v1/feedback_logs?order=id.desc", headers=headers_db)
    return res.json()


@app.put("/api/feedbacks/{fb_id}")
def update_feedback(fb_id: int, data: FeedbackUpdate):
    res = requests.patch(f"{SUPABASE_URL}/rest/v1/feedback_logs?id=eq.{fb_id}", headers=headers_db, json=data.dict())
    return {"status": "success"} if res.status_code in [200, 204] else {"status": "error"}


@app.delete("/api/feedbacks/{fb_id}")
def delete_feedback(fb_id: int):
    res = requests.delete(f"{SUPABASE_URL}/rest/v1/feedback_logs?id=eq.{fb_id}", headers=headers_db)
    return {"status": "success"} if res.status_code in [200, 204] else {"status": "error"}

# ==========================================
# 4. Analytics & AI Insights Dashboard 📊
# ==========================================
@app.get("/api/analytics")
def get_analytics():
    try:

        res = requests.get(f"{SUPABASE_URL}/rest/v1/feedback_logs?select=sentiment", headers=headers_db)
        feedbacks = res.json()
        

        positive = sum(1 for f in feedbacks if f.get('sentiment') == 'Positive')
        negative = sum(1 for f in feedbacks if f.get('sentiment') == 'Negative')
        neutral = sum(1 for f in feedbacks if f.get('sentiment') == 'Neutral')
        total = len(feedbacks)


        insight_prompt = f"""
        You are a Hospital Management AI.
        Recent patient feedback summary: {positive} Positive, {negative} Negative, {neutral} Neutral.
        Give ONE short, highly professional sentence of advice to the hospital director on what to focus on next based on these numbers. Do not use formatting like ** or *.
        """
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
        payload = {"contents": [{"parts": [{"text": insight_prompt}]}]}
        ai_res = requests.post(url, json=payload).json()
        
        if 'candidates' in ai_res:
            insight = ai_res['candidates'][0]['content']['parts'][0]['text'].strip()
        else:
            insight = "Keep monitoring patient feedback to maintain service quality."

        return {
            "status": "success",
            "stats": {"positive": positive, "negative": negative, "neutral": neutral, "total": total},
            "ai_insight": insight
        }

    except Exception as e:
        print(f"❌ Analytics Error: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/")
def home():
    return {"message": "MediBot AI Backend is Fully Running! 🚀"}