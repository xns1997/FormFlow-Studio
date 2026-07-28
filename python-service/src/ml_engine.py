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

def regression_predict(data, target_field, feature_fields=None, train_ratio=0.8, standardize_features=False):
    """带固定切分、基线比较和完整指标的数值预测。"""
    import pandas as pd
    from sklearn.compose import TransformedTargetRegressor
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LinearRegression
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler
    df = pd.DataFrame(data)
    fields = feature_fields or [c for c in df.columns if c != target_field and pd.api.types.is_numeric_dtype(df[c])]
    if target_field not in df or not fields:
        raise ValueError("目标字段或特征字段无效")
    clean = df[fields + [target_field]].copy()
    clean[target_field] = pd.to_numeric(clean[target_field], errors="coerce")
    clean = clean.dropna(subset=[target_field])
    if len(clean) < 10:
        raise ValueError("回归至少需要 10 条有效记录")
    split = max(1, min(len(clean) - 1, int(len(clean) * float(train_ratio))))
    train, test = clean.iloc[:split], clean.iloc[split:]
    steps = [("imputer", SimpleImputer(strategy="median"))]
    if standardize_features:
        steps.append(("scaler", StandardScaler()))
    steps.append(("model", LinearRegression()))
    model = Pipeline(steps)
    model.fit(train[fields], train[target_field])
    predicted = model.predict(test[fields])
    all_predictions = model.predict(clean[fields])
    baseline_value = float(train[target_field].mean())
    baseline = np.full(len(test), baseline_value)
    metrics = {
        "r2": float(r2_score(test[target_field], predicted)) if len(test) > 1 else None,
        "mae": float(mean_absolute_error(test[target_field], predicted)),
        "rmse": float(mean_squared_error(test[target_field], predicted) ** 0.5),
    }
    baseline_metrics = {
        "mae": float(mean_absolute_error(test[target_field], baseline)),
        "rmse": float(mean_squared_error(test[target_field], baseline) ** 0.5),
    }
    return {"metrics": metrics, "baseline": baseline_metrics, "better_than_baseline": metrics["mae"] < baseline_metrics["mae"], "features": fields, "target": target_field, "train_size": len(train), "test_size": len(test), "predictions": [float(v) for v in all_predictions]}

def classification_predict(data, target_field, feature_fields=None, train_ratio=0.8, threshold=0.5):
    """带分层切分、混淆矩阵、概率和多数类基线的分类预测。"""
    import pandas as pd
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.impute import SimpleImputer
    from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import Pipeline
    df = pd.DataFrame(data)
    fields = feature_fields or [c for c in df.columns if c != target_field and pd.api.types.is_numeric_dtype(df[c])]
    clean = df[fields + [target_field]].dropna(subset=[target_field])
    if len(clean) < 20 or clean[target_field].nunique() < 2:
        raise ValueError("分类至少需要 20 条记录和两个类别")
    X_train, X_test, y_train, y_test = train_test_split(clean[fields], clean[target_field], test_size=1-float(train_ratio), random_state=42, stratify=clean[target_field])
    model = Pipeline([("imputer", SimpleImputer(strategy="median")), ("model", RandomForestClassifier(n_estimators=100, random_state=42))])
    model.fit(X_train, y_train)
    probabilities = model.predict_proba(clean[fields])
    classes = model.named_steps["model"].classes_
    if len(classes) == 2:
        predictions = np.where(probabilities[:, 1] >= float(threshold), classes[1], classes[0])
        test_probabilities = model.predict_proba(X_test)
        test_predictions = np.where(test_probabilities[:, 1] >= float(threshold), classes[1], classes[0])
    else:
        predictions = classes[np.argmax(probabilities, axis=1)]
        test_predictions = model.predict(X_test)
    precision, recall, f1, _ = precision_recall_fscore_support(y_test, test_predictions, average="weighted", zero_division=0)
    accuracy = float(accuracy_score(y_test, test_predictions))
    majority_accuracy = float(y_test.value_counts(normalize=True).max())
    return {"metrics": {"accuracy": accuracy, "precision": float(precision), "recall": float(recall), "f1": float(f1)}, "baseline": {"majority_accuracy": majority_accuracy}, "better_than_baseline": accuracy > majority_accuracy, "classes": classes.tolist(), "confusion_matrix": confusion_matrix(y_test, test_predictions, labels=classes).tolist(), "features": fields, "target": target_field, "train_size": len(X_train), "test_size": len(X_test), "predictions": predictions.tolist(), "probabilities": probabilities.tolist()}

def time_series_forecast(data, time_field, target_field, horizon=6, seasonal_period=1):
    """时间顺序回测的趋势/季节基线预测，绝不随机打乱时间。"""
    import pandas as pd
    from sklearn.linear_model import LinearRegression
    from sklearn.metrics import mean_absolute_error, mean_squared_error
    df = pd.DataFrame(data)[[time_field, target_field]].copy()
    df[time_field] = pd.to_datetime(df[time_field], errors="coerce")
    df[target_field] = pd.to_numeric(df[target_field], errors="coerce")
    df = df.dropna().sort_values(time_field)
    if df[time_field].duplicated().any():
        raise ValueError("时间字段存在重复时间点")
    if len(df) < 12:
        raise ValueError("时间序列至少需要 12 个有效历史点")
    test_size = max(3, min(int(horizon), len(df) // 3))
    train, test = df.iloc[:-test_size], df.iloc[-test_size:]
    model = LinearRegression().fit(np.arange(len(train)).reshape(-1, 1), train[target_field].values)
    trend_test = model.predict(np.arange(len(train), len(df)).reshape(-1, 1))
    period = max(1, min(int(seasonal_period), len(train)))
    seasonal_test = np.resize(train[target_field].values[-period:], test_size)
    naive_test = np.full(test_size, float(train[target_field].iloc[-1]))
    def score(values):
        return {"mae": float(mean_absolute_error(test[target_field], values)), "rmse": float(mean_squared_error(test[target_field], values) ** 0.5)}
    candidates = {"trend": score(trend_test), "seasonal": score(seasonal_test), "last_value": score(naive_test)}
    selected = min(candidates, key=lambda name: candidates[name]["mae"])
    future_x = np.arange(len(df), len(df) + int(horizon)).reshape(-1, 1)
    if selected == "trend":
        forecast = model.predict(future_x)
    elif selected == "seasonal":
        forecast = np.resize(df[target_field].values[-period:], int(horizon))
    else:
        forecast = np.full(int(horizon), float(df[target_field].iloc[-1]))
    residual_std = float(np.std(test[target_field].values - (trend_test if selected == "trend" else seasonal_test if selected == "seasonal" else naive_test)))
    intervals = [{"lower": float(value - 1.96 * residual_std), "upper": float(value + 1.96 * residual_std)} for value in forecast]
    return {"metrics": candidates[selected], "baseline": candidates["last_value"], "better_than_baseline": selected != "last_value" and candidates[selected]["mae"] < candidates["last_value"]["mae"], "selected_model": selected, "candidates": candidates, "train_size": len(train), "test_size": len(test), "horizon": int(horizon), "forecast": [float(v) for v in forecast], "intervals": intervals, "time_start": str(df[time_field].min()), "time_end": str(df[time_field].max())}

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
    ma = [None if pd.isna(value) else float(value) for value in pd.Series(values).rolling(window=window).mean().tolist()]
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
        elif cmd == "regression_predict":
            result = regression_predict(data, args.get("target_field", ""), args.get("feature_fields"), args.get("train_ratio", 0.8), args.get("standardize", False))
        elif cmd == "classification_predict":
            result = classification_predict(data, args.get("target_field", ""), args.get("feature_fields"), args.get("train_ratio", 0.8), args.get("threshold", 0.5))
        elif cmd == "time_series_forecast":
            result = time_series_forecast(data, args.get("time_field", ""), args.get("target_field", ""), args.get("horizon", 6), args.get("seasonal_period", 1))
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
