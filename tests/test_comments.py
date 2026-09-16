def test_create_subtopic_comment(client, auth_headers, study_content):
    subtopic_id = study_content["subtopic"].id

    response = client.post(
        "/api/comments/",
        json={"content": "Отличная тема!", "subtopic_id": subtopic_id},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["content"] == "Отличная тема!"
    assert data["subtopic_id"] == subtopic_id
    assert data["author"]["username"] == "testuser"

    listed = client.get(f"/api/comments/subtopic/{subtopic_id}")
    assert listed.status_code == 200
    comments = listed.json()
    assert len(comments) == 1
    assert comments[0]["content"] == "Отличная тема!"


def test_create_topic_comment(client, auth_headers, study_content):
    topic_id = study_content["topic"].id

    response = client.post(
        "/api/comments/",
        json={"content": "Комментарий к теме", "topic_id": topic_id},
        headers=auth_headers,
    )
    assert response.status_code == 200

    listed = client.get(f"/api/comments/topic/{topic_id}")
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_create_comment_requires_auth(client, study_content):
    response = client.post(
        "/api/comments/",
        json={"content": "Без авторизации", "subtopic_id": study_content["subtopic"].id},
    )
    assert response.status_code == 401


def test_create_comment_requires_target(client, auth_headers):
    response = client.post(
        "/api/comments/",
        json={"content": "Без привязки"},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_multiple_comments_visible_after_create(client, auth_headers, study_content):
    subtopic_id = study_content["subtopic"].id

    client.post(
        "/api/comments/",
        json={"content": "Первый", "subtopic_id": subtopic_id},
        headers=auth_headers,
    )
    client.post(
        "/api/comments/",
        json={"content": "Второй", "subtopic_id": subtopic_id},
        headers=auth_headers,
    )

    listed = client.get(f"/api/comments/subtopic/{subtopic_id}")
    assert listed.status_code == 200
    contents = {item["content"] for item in listed.json()}
    assert contents == {"Первый", "Второй"}
