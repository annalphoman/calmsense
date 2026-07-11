import random
import urllib.request
import urllib.parse
import logging

logger = logging.getLogger("content_mapper")

# Curated tranquil images as fallbacks
FALLBACK_IMAGES = [
    "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?q=80&w=1200",  # Tranquil sunrise lake
    "https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?q=80&w=1200",  # Soft spring meadow
    "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?q=80&w=1200"   # Peaceful forest pathway
]

RHYTHMIC_SONGS = [
    "/static/audio/rhythmic_songs/song1.mp3",
    "/static/audio/rhythmic_songs/song2.mp3",
    "/static/audio/rhythmic_songs/song3.mp3"
]

def build_calming_prompt(distress_level: str, content_type: str, preferences: dict) -> str:
    """
    Constructs a highly descriptive, calming prompt for AI generation.
    """
    colors = preferences.get("colors", [])
    sounds = preferences.get("sounds", [])
    
    # Base prompt elements focused on tranquility and regulation
    color_desc = f"with a color palette of {', '.join(colors)}" if colors else "with soft, warm, pastel colors"
    sound_desc = f"inspired by the soothing theme of {', '.join(sounds)}" if sounds else "inspired by peaceful ambient nature"
    
    if content_type == "visual":
        prompt = (
            f"A deeply soothing and calming digital art design {color_desc}. "
            f"The image should depict a gentle, serene landscape (like a quiet garden, floating clouds, or still water at dusk). "
            f"Style is modern, minimalistic, smooth gradients, no harsh edges, extremely peaceful, therapeutic, high quality, 8k resolution, comforting."
        )
    elif content_type == "soundscape":
        prompt = (
            f"A visual representation of a calming soundscape {sound_desc} {color_desc}. "
            f"Beautiful abstract art, smooth lines, flowing liquid patterns, gentle waves, or soft light beams. "
            f"Emanates deep tranquility, stress relief, meditative, warm lighting, dreamlike, vector illustration style, serene."
        )
    else:
        prompt = "A peaceful, calming visual illustration, soft colors, slow movement feel, relaxing."
        
    # Adjust description slightly based on distress level to provide appropriate visual support
    if distress_level == "high":
        prompt += " Designed for immediate grounding, very simple patterns, low complexity, deeply stabilizing and comforting atmosphere."
    elif distress_level == "rising":
        prompt += " Designed to release tension, gentle flowing movement feel, comforting and reassuring."
    else:
        prompt += " Designed to maintain peace, open skies, airy, light, joyful yet calm."
        
    return prompt

def generate_calming_content(distress_level: str, content_type: str, preferences: dict) -> str:
    """
    Routes the content generation based on content_type.
    Returns either an image URL (Pollinations.ai / fallback) or a path to a pre-selected song.
    """
    if content_type == "rhythmic_song":
        # Return a pre-selected local audio file path
        # Use simple mapping or hash to give consistency if preferred, otherwise select based on preferences
        choice_idx = len(preferences.get("colors", [])) % len(RHYTHMIC_SONGS)
        return RHYTHMIC_SONGS[choice_idx]

    # Content type is 'visual' or 'soundscape'
    prompt = build_calming_prompt(distress_level, content_type, preferences)
    encoded_prompt = urllib.parse.quote(prompt)
    pollinations_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}"

    # Verify connection to Pollinations.ai with a timeout
    try:
        req = urllib.request.Request(
            pollinations_url, 
            headers={"User-Agent": "CalmSenseBackend/1.0"}
        )
        # We do a short read timeout to verify the service is responsive
        with urllib.request.urlopen(req, timeout=5.0) as response:
            if response.status == 200:
                logger.info("Successfully generated image via Pollinations.ai")
                return pollinations_url
            else:
                logger.warning(f"Pollinations returned status {response.status}, using fallback.")
    except Exception as e:
        logger.error(f"Pollinations connection failed or timed out: {e}")

    # Fallback to a random curated tranquil image from Unsplash
    return random.choice(FALLBACK_IMAGES)
