
# 🧩 CalmSense

> **Real-time AI companion for early sensory distress detection and calming support for autistic children during online therapy and home care.**

---

# Overview

CalmSense is a **real-time multimodal AI support system** designed to identify **early signs of sensory distress** in autistic children before the situation escalates into sensory overload.

Unlike systems that react only after a meltdown becomes obvious, CalmSense continuously analyzes **facial expressions** and **vocal characteristics** from a webcam and microphone, combines them into a simple distress score, and immediately delivers personalized calming interventions.

At the same time, therapists or parents can monitor the child's emotional state through a live dashboard, allowing earlier intervention during online therapy sessions or at home.

> **CalmSense is an assistive tool—not a diagnostic or medical device.**

---

# Problem Statement

Sensory overload in autistic children often develops rapidly.

During **online therapy**, therapists lose many of the subtle non-verbal cues available during in-person sessions, making it difficult to recognize rising distress early.

At home, parents—especially those new to supporting autistic children—may not recognize early warning signs until sensory overload has already escalated.

Current solutions primarily focus on calming children **after** distress becomes severe rather than detecting the earliest indicators.

There is a need for a lightweight, software-only system that can:

- Detect early multimodal distress signals
- Notify caregivers in real time
- Deliver immediate calming interventions
- Operate entirely using commonly available devices

---

# Solution

CalmSense provides two connected applications.

## Patient Mode

Runs on the child's device.

Continuously monitors:

- Webcam
- Microphone

Detects:

- Facial tension
- Restlessness
- Vocal stress patterns

Calculates a live distress score.

When the score increases beyond a threshold, CalmSense automatically provides calming support including:

- AI-generated calming visuals
- Ambient sounds or rhythmic counting songs
- Gentle spoken reassurance

---

## Therapist / Parent Dashboard

A companion dashboard connected through a secure session code.

Displays:

- Live distress gauge
- Facial observations
- Vocal observations
- Plain-language explanation
- Timestamped event log
- Automatic sustained-distress alerts

This allows caregivers to intervene before overload fully develops.

---

# Features

## Real-time facial analysis

- MediaPipe FaceMesh
- Rule-based facial tension scoring
- Explainable observations
- No model training required

---

## Real-time vocal analysis

Using librosa:

- Pitch variation
- Speech tempo
- RMS energy
- Vocal intensity estimation

---

## Multimodal distress fusion

Combines:

- Facial score
- Vocal score

Produces:

- Single normalized distress score
- Confidence indicator
- Plain-language explanation

---

## Personalized calming intervention

Automatically launches:

- AI calming artwork
- Relaxing ambient audio
- Counting rhythm
- Spoken reassurance

---

## Live caregiver dashboard

Shows:

- Distress meter
- Current observations
- Event timeline
- Alert notifications

---

## Privacy-first design

- Session-based only
- No permanent storage
- No clinical diagnosis
- No cloud training
- Lightweight JSON session files

---

# System Architecture

```
                 Webcam
                    │
             MediaPipe FaceMesh
                    │
             Facial Distress Score
                    │
                    ▼

              Distress Fusion Engine
                    ▲
                    │

              librosa Audio Analysis
                    │
               Vocal Distress Score
                    │
               Microphone Input


          ┌───────────────────────────┐
          │      FastAPI Backend       │
          │   WebSocket Communication  │
          └───────────────────────────┘
                  │            │
                  │            │
                  ▼            ▼

       Patient Mode      Therapist Dashboard

            │
            ▼

 Personalized Calming Intervention
```

---

# Technology Stack

| Layer | Technology |
|---------|------------|
| Frontend | Next.js |
| Styling | Tailwind CSS |
| Backend | FastAPI |
| Real-time Communication | FastAPI WebSockets |
| Facial Analysis | MediaPipe FaceMesh |
| Audio Analysis | librosa |
| AI Visual Generation | Pollinations.ai |
| Ambient Audio | Tone.js |
| Voice Reassurance | Web Speech API |
| Notifications | Web Notifications API |
| Storage | JSON Session Files |
| Authentication | Username + PIN |

---

# Project Structure

```
calmsense/

├── frontend/
│   ├── app/
│   ├── components/
│   ├── patient/
│   ├── dashboard/
│   ├── hooks/
│   └── utils/
│
├── backend/
│   ├── api/
│   ├── websocket/
│   ├── detection/
│   │      ├── face/
│   │      ├── audio/
│   │      └── fusion/
│   ├── intervention/
│   ├── storage/
│   └── main.py
│
├── sessions/
│
├── docs/
│
└── README.md
```

---

# Workflow

1. User logs in.
2. Session code is generated.
3. Dashboard joins the same session.
4. Webcam and microphone begin streaming.
5. Facial analysis runs.
6. Vocal analysis runs.
7. Distress score is calculated.
8. Dashboard updates live.
9. If threshold exceeded:
   - calming visual appears
   - calming audio starts
   - reassurance is spoken
10. If distress remains high:
    - caregiver receives notification

---

# Installation

## Clone repository

```bash
git clone https://github.com/yourusername/CalmSense.git

cd CalmSense
```

---

## Backend

```bash
cd backend

python -m venv venv

source venv/bin/activate

pip install -r requirements.txt

uvicorn main:app --reload
```

---

## Frontend

```bash
cd frontend

npm install

npm run dev
```

---

# Running the Project

Backend:

```
http://localhost:8000
```

Frontend:

```
http://localhost:3000
```

Open:

- Patient Mode
- Therapist Dashboard

Enter the same session code.

Observe live synchronization.

---

# Innovation

Unlike traditional calming applications, CalmSense integrates:

- Early multimodal distress detection
- Explainable AI observations
- Immediate personalized calming support
- Real-time caregiver awareness

without requiring:

- wearable devices
- custom ML training
- expensive sensors
- cloud GPU inference

---

# Feasibility

### Technical

- Uses mature open-source libraries
- Pretrained inference only
- Explainable scoring
- No custom datasets

### Resource

- Standard webcam
- Standard microphone
- Runs on ordinary laptops

### Hackathon Scope

Designed specifically for a **24-hour hackathon** by excluding:

- medical diagnosis
- persistent patient history
- production authentication
- wearable integration
- custom deep-learning training

---

# Limitations

CalmSense is intended solely as an assistive support tool.

It:

- does **not** diagnose autism
- does **not** diagnose stress disorders
- does **not** replace therapists
- does **not** provide medical advice

Facial and vocal observations are explainable heuristic indicators intended for demonstration and supportive practice only.

---

# Future Enhancements

- Personalized user profiles
- Adaptive intervention preferences
- Therapist analytics
- Mobile application
- Multi-language support
- Offline inference
- Secure cloud deployment
- Electronic health record integration
- Wearable sensor compatibility

---

# Team

Built during a hackathon by a multidisciplinary team combining expertise in:

- Artificial Intelligence
- Computer Vision
- Audio Signal Processing
- Full Stack Development
- Human-Centered Design

---

# License

This project is released under the MIT License.

---

# Acknowledgements

- MediaPipe
- FastAPI
- librosa
- Pollinations.ai
- Tone.js
- Web Speech API
- Next.js
- Tailwind CSS

---

> **CalmSense empowers therapists and caregivers with timely insights while providing children with immediate, personalized calming support—helping transform delayed reactions into proactive care.**
