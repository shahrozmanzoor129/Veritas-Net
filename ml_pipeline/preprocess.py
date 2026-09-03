import os
import re
import pickle
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer

try:
    import nltk
    from nltk.corpus import stopwords
    nltk.download('stopwords', quiet=True)
    STOPWORDS = set(stopwords.words('english'))
except Exception:
    # Fallback minimal stopwords
    STOPWORDS = {"i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", 
                 "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", 
                 "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves", 
                 "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are", 
                 "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", 
                 "did", "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until", 
                 "while", "of", "at", "by", "for", "with", "about", "against", "between", "into", 
                 "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", 
                 "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", 
                 "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", 
                 "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", 
                 "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now"}

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASETS_DIR = os.path.join(PROJECT_ROOT, "Datasets")
MASTER_DATASET_PATH = os.path.join(DATASETS_DIR, "master_dataset.csv")

def preprocess_text(text):
    if not isinstance(text, str):
        return ""
    # Lowercase
    text = text.lower()
    # Remove punctuation
    text = re.sub(r'[^\w\s]', '', text)
    # Remove stopwords
    words = text.split()
    words = [w for w in words if w not in STOPWORDS]
    return ' '.join(words)

def balance_dataset(df):
    if df.empty:
        return df
    # Find minimum class count
    counts = df['status'].value_counts()
    if 'Real' not in counts or 'Fake' not in counts:
        return df # Can't balance
    
    min_len = min(counts['Real'], counts['Fake'])
    df_real = df[df['status'] == 'Real'].sample(n=min_len, random_state=42)
    df_fake = df[df['status'] == 'Fake'].sample(n=min_len, random_state=42)
    balanced_df = pd.concat([df_real, df_fake]).sample(frac=1, random_state=42).reset_index(drop=True)
    return balanced_df

def merge_and_get_dataset(new_dataset_path=None):
    os.makedirs(DATASETS_DIR, exist_ok=True)
    
    df = None
    if not os.path.exists(MASTER_DATASET_PATH):
        dfs = []
        
        # 1. fake-and-real-news-dataset
        true_path = os.path.join(DATASETS_DIR, "fake-and-real-news-dataset", "True.csv")
        fake_path = os.path.join(DATASETS_DIR, "fake-and-real-news-dataset", "Fake.csv")
        if os.path.exists(true_path) and os.path.exists(fake_path):
            df_true = pd.read_csv(true_path)
            df_true['status'] = 'Real'
            df_true['content'] = df_true['title'].fillna('') + " " + df_true['text'].fillna('')
            dfs.append(df_true[['content', 'status']])
            
            df_fake = pd.read_csv(fake_path)
            df_fake['status'] = 'Fake'
            df_fake['content'] = df_fake['title'].fillna('') + " " + df_fake['text'].fillna('')
            dfs.append(df_fake[['content', 'status']])
            
        # 2. LIAR dataset
        liar_dir = os.path.join(DATASETS_DIR, "LIAR Fake news dataset")
        if os.path.exists(liar_dir):
            for tsv_file in ["train.tsv", "test.tsv", "valid.tsv"]:
                tsv_path = os.path.join(liar_dir, tsv_file)
                if os.path.exists(tsv_path):
                    df_liar = pd.read_csv(tsv_path, sep='\t', header=None, usecols=[1, 2], names=['label', 'text'])
                    df_liar['status'] = df_liar['label'].apply(
                        lambda x: 'Real' if str(x).lower().strip() in ['true', 'mostly-true', 'half-true'] else 'Fake'
                    )
                    df_liar['content'] = df_liar['text'].fillna('')
                    dfs.append(df_liar[['content', 'status']])
        
        if dfs:
            df = pd.concat(dfs, ignore_index=True)
            df = df.sample(n=min(20000, len(df)), random_state=42)
            df = df.drop_duplicates(subset=['content']).dropna()
            df = balance_dataset(df)
            df.to_csv(MASTER_DATASET_PATH, index=False)
            print(f"[INFO] Created new balanced master dataset with {len(df)} records.")
    else:
        df = pd.read_csv(MASTER_DATASET_PATH)
        print(f"[INFO] Loaded master dataset with {len(df)} records.")
    
    if new_dataset_path and os.path.exists(new_dataset_path):
        print(f"[INFO] Merging new dataset from {new_dataset_path}")
        try:
            df_new = pd.read_csv(new_dataset_path)
            if 'text' in df_new.columns and 'content' not in df_new.columns:
                df_new['content'] = df_new['text']
            if 'title' in df_new.columns and 'content' in df_new.columns and df_new['content'].isnull().all():
                pass 
                
            if 'label' in df_new.columns and 'status' not in df_new.columns:
                df_new['status'] = df_new['label'].apply(
                    lambda x: 'Real' if str(x).lower() in ['1', 'true', 'real'] else 'Fake'
                )
            
            if 'content' not in df_new.columns or 'status' not in df_new.columns:
                raise ValueError("Uploaded CSV must contain 'content' and 'status' (or 'text'/'label') columns.")
            
            df_new = df_new[['content', 'status']]
            df = pd.concat([df, df_new])
            df = df.drop_duplicates(subset=['content']).dropna()
            df = balance_dataset(df)
            
            # SANDBOX FIX: We strictly DO NOT save to CSV here anymore.
            print(f"[INFO] Merged in memory. Sandbox dataset size: {len(df)}")
            
        except Exception as e:
            print(f"[ERROR] Failed to merge new dataset: {e}")
            raise e 
            
    if df is None or df.empty:
        raise ValueError("Master dataset is virtually empty. Cannot proceed.")
        
    return df

def commit_dataset_to_disk(df):
    """Called by train_models.py ONLY if the Deep_LSTM accuracy improves."""
    df.to_csv(MASTER_DATASET_PATH, index=False)
    print(f"[INFO] SUCCESS: Master dataset permanently updated on disk.")

def prepare_data(new_dataset_path=None, max_features=3000):
    df = merge_and_get_dataset(new_dataset_path)
    
    print("[INFO] Preprocessing text...")
    df['clean_content'] = df['content'].apply(preprocess_text)
    
    print("[INFO] Vectorizing with TF-IDF...")
    vectorizer = TfidfVectorizer(max_features=max_features)
    X = vectorizer.fit_transform(df['clean_content']).toarray()
    y = df['status'].apply(lambda x: 1 if x == 'Real' else 0).values
    
    models_dir = os.path.join(PROJECT_ROOT, "ml_pipeline", "models")
    os.makedirs(models_dir, exist_ok=True)
    
    vec_path = os.path.join(models_dir, "tfidf_vectorizer.pkl")
    with open(vec_path, 'wb') as f:
        pickle.dump(vectorizer, f)
    print(f"[INFO] Saved vectorizer to {vec_path}")
    
    # 70/30 Split strictly as requested. Dynamic random state for healthy variance.
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
    print(f"[INFO] Train size: {len(X_train)} | Test size: {len(X_test)}")
    
    # We now return 'df' as well so train_models can save it later if the fail-safe passes
    return X_train, X_test, y_train, y_test, vectorizer, df