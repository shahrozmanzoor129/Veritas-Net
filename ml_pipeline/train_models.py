import sys
import os
import time
import json
import pickle
import numpy as np
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from ml_pipeline.preprocess import prepare_data, commit_dataset_to_disk

# Ensure Keras 3 with JAX Backend
os.environ["KERAS_BACKEND"] = "jax"
import keras
from keras import layers

# Get the absolute path of the current directory (ml_pipeline)
current_dir = os.path.dirname(os.path.abspath(__file__))
# Get the parent directory (the root VERITAS-NET folder)
project_root = os.path.dirname(current_dir)
# Add the root to Python's path so it can find the 'backend' module
sys.path.append(project_root)

# Now you can safely import your database function!
from backend.database import save_metrics_to_db

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(PROJECT_ROOT, "ml_pipeline", "models")


def build_lstm_model(input_dim):
    # LSTM expecting (batch, timesteps, features)
    model = keras.Sequential([
        keras.Input(shape=(1, input_dim)),
        layers.LSTM(64, dropout=0.5), 
        layers.Dense(32, activation='relu'),
        layers.Dropout(0.5),
        layers.Dense(1, activation='sigmoid')
    ])
    model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
    return model


def get_classical_models():
    from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
    from sklearn.svm import LinearSVC
    from sklearn.naive_bayes import MultinomialNB
    from sklearn.linear_model import LogisticRegression
    from sklearn.neighbors import KNeighborsClassifier
    from sklearn.neural_network import MLPClassifier
    
    return {
        "Random_Forest": RandomForestClassifier(n_estimators=50, max_depth=10, min_samples_leaf=4),
        "SVM": LinearSVC(C=0.1, dual=False),
        "Naive_Bayes": MultinomialNB(alpha=1.0),
        "Logistic_Regression": LogisticRegression(C=0.5, max_iter=300),
        "KNN": KNeighborsClassifier(n_neighbors=7),
        "Gradient_Boosting": GradientBoostingClassifier(n_estimators=50, max_depth=3),
        "MLP": MLPClassifier(hidden_layer_sizes=(64,), alpha=0.01, early_stopping=True, max_iter=200)
    }

def calculate_metrics(y_true, y_pred):
    # FIXED: Converts all metrics to strict percentages (e.g., 88.08)
    return {
        "accuracy": round(accuracy_score(y_true, y_pred) * 100, 2),
        "precision": round(precision_score(y_true, y_pred, zero_division=0) * 100, 2),
        "recall": round(recall_score(y_true, y_pred, zero_division=0) * 100, 2),
        "f1_score": round(f1_score(y_true, y_pred, zero_division=0) * 100, 2)
    }

def train_all(new_dataset_path=None):
    os.makedirs(MODELS_DIR, exist_ok=True)
    
    # FAIL-SAFE: Read the old model's accuracy before we start.
    old_accuracy = None
    metrics_path = os.path.join(MODELS_DIR, "metrics.json")
    if new_dataset_path and os.path.exists(metrics_path):
        try:
            with open(metrics_path, 'r') as f:
                old_metrics = json.load(f)
            old_accuracy = old_metrics.get("metrics", {}).get("accuracy")
            if old_accuracy is not None:
                print(f"[FAIL-SAFE] Current best model accuracy: {old_accuracy}%. New model must match or exceed this.")
        except Exception as e:
            print(f"[FAIL-SAFE] Could not read existing metrics.json: {e}")

    # 1. Get preprocessed balanced split AND the sandbox dataframe
    X_train, X_test, y_train, y_test, vectorizer, final_df = prepare_data(new_dataset_path, max_features=3000)
    
    print("[INFO] Starting training phase for all models...")
    models_dict = get_classical_models()
    
    results = {}
    
    # Evaluate Classical Models (Just for the dashboard matrix)
    for name, clf in models_dict.items():
        print(f"[INFO] Training {name}...")
        clf.fit(X_train, y_train)
        
        start_time = time.time()
        y_pred = clf.predict(X_test)
        end_time = time.time()
        
        ms_per_sample = ((end_time - start_time) / len(X_test)) * 1000
        metrics = calculate_metrics(y_test, y_pred)
        metrics["inference_speed_ms"] = ms_per_sample
        
        heuristic_score = (metrics["f1_score"] / 10) - (ms_per_sample * 0.05)
        metrics["score"] = heuristic_score
        results[name] = metrics
            
    # Evaluate Deep LSTM
    print("[INFO] Training Deep_LSTM (Keras 3 with JAX)...")
    lstm = build_lstm_model(input_dim=X_train.shape[1])
    
    X_train_lstm = np.expand_dims(X_train, axis=1)
    X_test_lstm = np.expand_dims(X_test, axis=1)
    
    early_stop = keras.callbacks.EarlyStopping(monitor='val_loss', patience=2, restore_best_weights=True)
    lstm.fit(X_train_lstm, y_train, epochs=10, batch_size=32, validation_split=0.1, callbacks=[early_stop], verbose=1)
    
    print("[INFO] Evaluating Deep LSTM...")
    start_time = time.time()
    y_pred_probs = lstm.predict(X_test_lstm, batch_size=64, verbose=0)
    end_time = time.time()
    
    y_pred_lstm = (y_pred_probs.flatten() >= 0.5).astype(int)
    ms_per_sample_lstm = ((end_time - start_time) / len(X_test)) * 1000
    
    lstm_metrics = calculate_metrics(y_test, y_pred_lstm)
    lstm_metrics["inference_speed_ms"] = ms_per_sample_lstm
    lstm_score = (lstm_metrics["f1_score"] / 10) - (ms_per_sample_lstm * 0.05)
    lstm_metrics["score"] = lstm_score
    results["Deep_LSTM"] = lstm_metrics

    # ── ENFORCE DEEP_LSTM AS THE KING ────────────────────────────────────────
    # We ignore classical model scores. Deep_LSTM is always the best model.
    best_model_name = "Deep_LSTM"
    best_model_obj = lstm
    best_model_type = "keras"
    new_accuracy = results["Deep_LSTM"]["accuracy"]

    print(f"\n[INFO] Best Model Locked: {best_model_name} (Accuracy: {new_accuracy}%)")

    # ── STRICT FAIL-SAFE CHECK ───────────────────────────────────────────────
    if old_accuracy is not None and new_accuracy < old_accuracy:
        print(f"\n[FAIL-SAFE] *** TRAINING ABORTED ***")
        print(f"[FAIL-SAFE] New LSTM accuracy ({new_accuracy}%) is LOWER than current ({old_accuracy}%).")
        print(f"[FAIL-SAFE] The uploaded dataset was rejected to prevent contamination.")
        
        # Clean up the uploaded file
        if new_dataset_path and os.path.exists(new_dataset_path):
            os.remove(new_dataset_path)
            
        return None, None
    # ─────────────────────────────────────────────────────────────────────────

    # Save the Best Model (Deep_LSTM)
    best_pkl_path = os.path.join(MODELS_DIR, "best_model.pkl")
    best_keras_path = os.path.join(MODELS_DIR, "best_model.keras")
    
    if os.path.exists(best_pkl_path): os.remove(best_pkl_path)
    if os.path.exists(best_keras_path): os.remove(best_keras_path)
    
    best_model_obj.save(best_keras_path)
        
    metrics_report = {
        "model_name": best_model_name,
        "metrics": results[best_model_name],
        "all_models": results
    }
    
    with open(os.path.join(MODELS_DIR, "metrics.json"), 'w') as f:
        json.dump(metrics_report, f, indent=4)

# ─── ADD STEP 2 HERE ─────────────────────────────────────────────────────
    print("[INFO] Syncing new metrics to the database...")
    metrics_path = os.path.join(MODELS_DIR, "metrics.json")
    save_metrics_to_db(json_file_path=metrics_path)
# ─────────────────────────────────────────────────────────────────────────
        
    # SANDBOX COMPLETION: Only save the dataset because the model passed the fail-safe!
    commit_dataset_to_disk(final_df)
    
    # Final cleanup of the uploaded file
    if new_dataset_path and os.path.exists(new_dataset_path):
        os.remove(new_dataset_path)
        
    print("[INFO] Training Pipeline Completed Successfully.")
    return best_model_name, metrics_report

if __name__ == "__main__":
    train_all()