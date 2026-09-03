import os
import json
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd

# Look directly into the 'models' folder for the JSON
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
METRICS_PATH = os.path.join(CURRENT_DIR, "models", "metrics.json")

def main():
    print("[1/3] Loading your live system metrics...")
    if not os.path.exists(METRICS_PATH):
        print(f"[ERROR] Could not find {METRICS_PATH}.")
        return

    with open(METRICS_PATH, 'r') as f:
        data = json.load(f)

    # Grab the section containing all 8 models
    all_models = data.get("all_models", {})
    if not all_models:
        print("[ERROR] 'all_models' data not found in metrics.json!")
        return

    print("[2/3] Preparing data for the comparison matrix...")
    matrix_data = []
    model_names = []
    
    # Loop through each model and extract its scores as percentages
    for model_name, metrics in all_models.items():
        clean_name = model_name.replace("_", " ") # Changes 'Deep_LSTM' to 'Deep LSTM'
        model_names.append(clean_name)
        
        matrix_data.append([
            metrics.get("accuracy", 0),
            metrics.get("precision", 0),
            metrics.get("recall", 0),
            metrics.get("f1_score", 0)
        ])

    # Convert the data into a Pandas DataFrame for easy table mapping
    df = pd.DataFrame(matrix_data, index=model_names, columns=['Accuracy', 'Precision', 'Recall', 'F1-Score'])
    
    # Sort the matrix by Accuracy (Highest to Lowest) so it looks professional
    df = df.sort_values(by='Accuracy', ascending=False)

    print("[3/3] Drawing the Algorithms Comparison Matrix...")
    plt.figure(figsize=(10, 8))
    sns.set_theme(style="whitegrid")
    
    # Draw the heatmap matrix
    # cmap='Blues' keeps your Veritas-Net color theme
    # fmt='.1f' ensures 1 decimal place (e.g., 88.1)
    sns.heatmap(df, annot=True, fmt='.1f', cmap='Blues', linewidths=1, 
                annot_kws={"size": 12, "weight": "bold"})
                
    plt.title('Veritas-Net: Algorithms Comparison Matrix (%)', fontsize=16, fontweight='bold', pad=20)
    plt.ylabel('Machine Learning Models', fontsize=12, fontweight='bold')
    plt.xlabel('Performance Metrics', fontsize=12, fontweight='bold')
    
    # Save the image
    plt.tight_layout()
    plt.savefig('report_algorithms_comparison.png', dpi=300, bbox_inches='tight')
    plt.close()
    
    print("\n[SUCCESS] Generated 'report_algorithms_comparison.png' successfully!")

if __name__ == '__main__':
    main()