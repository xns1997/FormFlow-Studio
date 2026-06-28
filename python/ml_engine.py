#!/usr/bin/env python3
"""机器学习运算服务 - 数据预处理、分析、挖掘"""
import json
import sys
import numpy as np

def normalize(data, fields=None, min_val=0, max_val=1):
    """Min-Max 归一化"""
    import pandas as pd
    df = pd.DataFrame(data)
    if not fields:
        fields = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    params = {}
    for f in fields:
        col_min, col_max = df[f].min(), df[f].max()
        params[f] = {"min": float(col_min), "max": float(col_max)}
        if col_max > col_min:
            df[f] = (df[f] - col_min) / (col_max - col_min) * (max_val - min_val) + min_val
    return {"data": df.to_dict(orient="records"), "params": params}

def standardize(data, fields=None):
    """Z-Score 标准化"""
    import pandas as pd
    df = pd.DataFrame(data)
    if not fields:
        fields = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    params = {}
    for f in fields:
        mean, std = df[f].mean(), df[f].std()
        params[f] = {"mean": float(mean), "std": float(std)}
        if std > 0:
            df[f] = (df[f] - mean) / std
    return {"data": df.to_dict(orient="records"), "params": params}

def onehot_encode(data, fields):
    """One-Hot 编码"""
    import pandas as pd
    df = pd.DataFrame(data)
    fields_list = [f.strip() for f in fields.split(",") if f.strip()]
    df = pd.get_dummies(df, columns=fields_list, dtype=int)
    return {"data": df.to_dict(orient="records")}

def label_encode(data, fields):
    """Label 编码"""
    import pandas as pd
    df = pd.DataFrame(data)
    fields_list = [f.strip() for f in fields.split(",") if f.strip()]
    mapping = {}
    for f in fields_list:
        codes = {v: i for i, v in enumerate(df[f].unique())}
        df[f] = df[f].map(codes)
        mapping[f] = codes
    return {"data": df.to_dict(orient="records"), "mapping": mapping}

def pca_reduce(data, n_components=2, fields=None):
    """PCA 降维"""
    import pandas as pd
    from sklearn.decomposition import PCA
    df = pd.DataFrame(data)
    if not fields:
        fields = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    X = df[fields].values
    n = min(n_components, len(fields), len(X))
    pca = PCA(n_components=n)
    result = pca.fit_transform(X)
    out_df = pd.DataFrame(result, columns=[f"PC{i+1}" for i in range(n)])
    return {
        "data": out_df.to_dict(orient="records"),
        "explained_variance_ratio": pca.explained_variance_ratio_.tolist(),
        "components": pca.components_.tolist()
    }

def descriptive_stats(data):
    """描述性统计"""
    import pandas as pd
    df = pd.DataFrame(data)
    desc = df.describe(include="all").to_dict()
    # 清理 NaN
    for col in desc:
        for stat in desc[col]:
            if isinstance(desc[col][stat], float) and np.isnan(desc[col][stat]):
                desc[col][stat] = None
    return {"stats": desc, "shape": list(df.shape), "dtypes": {c: str(df[c].dtype) for c in df.columns}}

def correlation(data, fields=None, method="pearson"):
    """相关性分析"""
    import pandas as pd
    df = pd.DataFrame(data)
    if not fields:
        fields = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    corr = df[fields].corr(method=method)
    return {"matrix": corr.to_dict(), "columns": list(corr.columns)}

def linear_regression(data, x_field, y_field):
    """线性回归"""
    import pandas as pd
    from sklearn.linear_model import LinearRegression
    df = pd.DataFrame(data)
    X = df[[x_field]].values
    y = df[y_field].values
    model = LinearRegression()
    model.fit(X, y)
    predictions = model.predict(X)
    return {
        "slope": float(model.coef_[0]),
        "intercept": float(model.intercept_),
        "r2": float(model.score(X, y)),
        "predictions": predictions.tolist()
    }

def kmeans_cluster(data, n_clusters=3, fields=None):
    """K-Means 聚类"""
    import pandas as pd
    from sklearn.cluster import KMeans
    df = pd.DataFrame(data)
    if not fields:
        fields = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    X = df[fields].values
    n = min(n_clusters, len(X))
    model = KMeans(n_clusters=n, random_state=42, n_init=10)
    labels = model.fit_predict(X)
    df["cluster"] = labels
    return {
        "data": df.to_dict(orient="records"),
        "centers": model.cluster_centers_.tolist(),
        "inertia": float(model.inertia_),
        "labels": labels.tolist()
    }

def knn_classify(data, train_ratio=0.8, target_field="", n_neighbors=5):
    """KNN 分类"""
    import pandas as pd
    from sklearn.neighbors import KNeighborsClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score
    df = pd.DataFrame(data)
    feature_cols = [c for c in df.columns if c != target_field and pd.api.types.is_numeric_dtype(df[c])]
    X = df[feature_cols].values
    y = df[target_field].values
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=1-train_ratio, random_state=42)
    model = KNeighborsClassifier(n_neighbors=min(n_neighbors, len(X_train)))
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    return {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "predictions": model.predict(X).tolist(),
        "classes": model.classes_.tolist()
    }

def anomaly_detect(data, fields=None, contamination=0.1):
    """异常检测 (Isolation Forest)"""
    import pandas as pd
    from sklearn.ensemble import IsolationForest
    df = pd.DataFrame(data)
    if not fields:
        fields = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    X = df[fields].values
    model = IsolationForest(contamination=contamination, random_state=42)
    labels = model.fit_predict(X)
    scores = model.decision_function(X)
    df["anomaly"] = (labels == -1).astype(int)
    df["anomaly_score"] = scores
    return {
        "data": df.to_dict(orient="records"),
        "anomaly_count": int((labels == -1).sum()),
        "normal_count": int((labels == 1).sum())
    }

def hypothesis_test(data, field1, field2=None, test_type="ttest"):
    """假设检验"""
    import pandas as pd
    from scipy import stats
    df = pd.DataFrame(data)
    if test_type == "ttest":
        if field2:
            stat, p = stats.ttest_ind(df[field1].dropna(), df[field2].dropna())
        else:
            stat, p = stats.ttest_1samp(df[field1].dropna(), 0)
        return {"test": "t-test", "statistic": float(stat), "p_value": float(p), "significant": p < 0.05}
    elif test_type == "chi2":
        ct = pd.crosstab(df[field1], df[field2])
        stat, p, dof, expected = stats.chi2_contingency(ct)
        return {"test": "chi-squared", "statistic": float(stat), "p_value": float(p), "dof": int(dof), "significant": p < 0.05}
    return {"error": f"未知检验类型: {test_type}"}

def time_series(data, field, periods=10):
    """时间序列分析 (移动平均 + 趋势)"""
    import pandas as pd
    df = pd.DataFrame(data)
    values = df[field].dropna().values
    if len(values) < 3:
        return {"error": "数据量不足"}
    window = min(3, len(values) // 2)
    ma = pd.Series(values).rolling(window=window).mean().tolist()
    trend = np.polyfit(range(len(values)), values, 1).tolist()
    return {
        "moving_average": ma,
        "trend_slope": float(trend[0]),
        "trend_intercept": float(trend[1]),
        "min": float(np.min(values)),
        "max": float(np.max(values)),
        "mean": float(np.mean(values))
    }

def feature_select(data, target_field, method="variance", threshold=0.01):
    """特征选择"""
    import pandas as pd
    from sklearn.feature_selection import VarianceThreshold
    df = pd.DataFrame(data)
    feature_cols = [c for c in df.columns if c != target_field and pd.api.types.is_numeric_dtype(df[c])]
    X = df[feature_cols].values
    if method == "variance":
        selector = VarianceThreshold(threshold=threshold)
        selector.fit(X)
        mask = selector.get_support()
        selected = [feature_cols[i] for i, m in enumerate(mask) if m]
        return {"selected_features": selected, "removed_features": [f for f in feature_cols if f not in selected]}
    return {"error": f"未知方法: {method}"}

def random_forest(data, target_field, n_estimators=100, train_ratio=0.8):
    """随机森林分类"""
    import pandas as pd
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score
    df = pd.DataFrame(data)
    feature_cols = [c for c in df.columns if c != target_field and pd.api.types.is_numeric_dtype(df[c])]
    X = df[feature_cols].values
    y = df[target_field].values
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=1-train_ratio, random_state=42)
    model = RandomForestClassifier(n_estimators=n_estimators, random_state=42)
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    importances = dict(zip(feature_cols, model.feature_importances_.tolist()))
    return {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "feature_importances": importances,
        "predictions": model.predict(X).tolist()
    }

def naive_bayes(data, target_field, train_ratio=0.8):
    """朴素贝叶斯分类"""
    import pandas as pd
    from sklearn.naive_bayes import GaussianNB
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score
    df = pd.DataFrame(data)
    feature_cols = [c for c in df.columns if c != target_field and pd.api.types.is_numeric_dtype(df[c])]
    X = df[feature_cols].values
    y = df[target_field].values
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=1-train_ratio, random_state=42)
    model = GaussianNB()
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    return {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "predictions": model.predict(X).tolist(),
        "classes": model.classes_.tolist()
    }

def svm_classify(data, target_field, kernel="rbf", train_ratio=0.8):
    """SVM 分类"""
    import pandas as pd
    from sklearn.svm import SVC
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score
    df = pd.DataFrame(data)
    feature_cols = [c for c in df.columns if c != target_field and pd.api.types.is_numeric_dtype(df[c])]
    X = df[feature_cols].values
    y = df[target_field].values
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=1-train_ratio, random_state=42)
    model = SVC(kernel=kernel, random_state=42)
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    return {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "predictions": model.predict(X).tolist(),
        "support_vectors": int(model.n_support_.sum())
    }

# ── 主入口 ──────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "用法: python ml_engine.py <command> [args...]"}))
        sys.exit(1)

    cmd = sys.argv[1]
    try:
        args = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    except:
        args = {}

    data = args.get("data", [])

    try:
        if cmd == "normalize":
            result = normalize(data, args.get("fields"), args.get("min", 0), args.get("max", 1))
        elif cmd == "standardize":
            result = standardize(data, args.get("fields"))
        elif cmd == "onehot_encode":
            result = onehot_encode(data, args.get("fields", ""))
        elif cmd == "label_encode":
            result = label_encode(data, args.get("fields", ""))
        elif cmd == "pca":
            result = pca_reduce(data, args.get("n_components", 2), args.get("fields"))
        elif cmd == "descriptive_stats":
            result = descriptive_stats(data)
        elif cmd == "correlation":
            result = correlation(data, args.get("fields"), args.get("method", "pearson"))
        elif cmd == "linear_regression":
            result = linear_regression(data, args.get("x_field", ""), args.get("y_field", ""))
        elif cmd == "kmeans":
            result = kmeans_cluster(data, args.get("n_clusters", 3), args.get("fields"))
        elif cmd == "knn":
            result = knn_classify(data, args.get("train_ratio", 0.8), args.get("target_field", ""), args.get("n_neighbors", 5))
        elif cmd == "anomaly_detect":
            result = anomaly_detect(data, args.get("fields"), args.get("contamination", 0.1))
        elif cmd == "hypothesis_test":
            result = hypothesis_test(data, args.get("field1", ""), args.get("field2"), args.get("test_type", "ttest"))
        elif cmd == "time_series":
            result = time_series(data, args.get("field", ""), args.get("periods", 10))
        elif cmd == "feature_select":
            result = feature_select(data, args.get("target_field", ""), args.get("method", "variance"), args.get("threshold", 0.01))
        elif cmd == "random_forest":
            result = random_forest(data, args.get("target_field", ""), args.get("n_estimators", 100), args.get("train_ratio", 0.8))
        elif cmd == "naive_bayes":
            result = naive_bayes(data, args.get("target_field", ""), args.get("train_ratio", 0.8))
        elif cmd == "svm":
            result = svm_classify(data, args.get("target_field", ""), args.get("kernel", "rbf"), args.get("train_ratio", 0.8))
        else:
            result = {"error": f"未知命令: {cmd}"}
    except Exception as e:
        result = {"error": str(e)}

    print(json.dumps(result, ensure_ascii=False, default=str))
