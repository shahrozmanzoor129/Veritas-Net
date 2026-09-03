import os
import json
import pickle
import numpy as np

os.environ["KERAS_BACKEND"] = "jax"
import keras

from ml_pipeline.preprocess import preprocess_text

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(PROJECT_ROOT, "ml_pipeline", "models")

VECTORIZER_PATH = os.path.join(MODELS_DIR, "tfidf_vectorizer.pkl")
PKL_MODEL_PATH = os.path.join(MODELS_DIR, "best_model.pkl")
KERAS_MODEL_PATH = os.path.join(MODELS_DIR, "best_model.keras")
METRICS_PATH = os.path.join(MODELS_DIR, "metrics.json")

# Global caches for speed
_vectorizer = None
_model = None
_is_keras_model = False

def _load_artifacts():
    global _vectorizer, _model, _is_keras_model
    
    if _vectorizer is None:
        if not os.path.exists(VECTORIZER_PATH):
            return False
        with open(VECTORIZER_PATH, 'rb') as f:
            _vectorizer = pickle.load(f)
            
    if _model is None:
        if os.path.exists(KERAS_MODEL_PATH):
            _model = keras.saving.load_model(KERAS_MODEL_PATH)
            _is_keras_model = True
        elif os.path.exists(PKL_MODEL_PATH):
            with open(PKL_MODEL_PATH, 'rb') as f:
                _model = pickle.load(f)
            _is_keras_model = False
        else:
            return False
            
    return True

def predict_fake_news(text):
    """
    Inference endpoint.
    Strict threshold: >= 65% probability for Real == 'Real', else 'Fake'.
    Returns {"status": "Real"|"Fake", "confidence": float}
    """
    if not _load_artifacts():
        raise Exception("Models not trained yet. Please train the pipeline first.")
        
    cleaned_text = preprocess_text(text)
    
    # TF-IDF Transform
    X = _vectorizer.transform([cleaned_text]).toarray()
    
    prob_real = 0.0
    
    if _is_keras_model:
        # LSTM input shape: (batch_size, timesteps, features)
        X_lstm = np.expand_dims(X, axis=1)
        prob = _model.predict(X_lstm, verbose=0)
        prob_real = float(prob[0][0])
    else:
        # Classical model
        if hasattr(_model, 'predict_proba'):
            probs = _model.predict_proba(X)
            prob_real = float(probs[0][1]) # Class 1 is 'Real'
        elif hasattr(_model, 'decision_function'):
            df = _model.decision_function(X)
            prob_real = float(1 / (1 + np.exp(-df[0])))
        else:
            # Fallback
            pred = _model.predict(X)
            prob_real = 1.0 if pred[0] == 1 else 0.0

    # Business Logic Threshold
    status = "Real" if prob_real >= 0.65 else "Fake"
    confidence_percentage = round(prob_real * 100, 2)
    
    # Adjust confidence display (if it's Fake, confidence is confidence of being fake)
    # The prompt says: If the model's confidence score (probability) of the news being 'Real' is >= 65%, classify the status as 'Real'. Otherwise, classify it as 'Fake'. Ensure the returned dictionary matches exactly: {"status": "Real"|"Fake", "confidence": float}.
    # Often, confidence is P(status). So if status is Fake, P(Fake) = 1 - prob_real
    if status == "Fake":
        confidence_percentage = round((1.0 - prob_real) * 100, 2)
        
    return {
        "status": status,
        "confidence": confidence_percentage
    }

def get_model_metrics():
    if not os.path.exists(METRICS_PATH):
        return None
    try:
        with open(METRICS_PATH, 'r') as f:
            return json.load(f)
    except Exception:
        return None
