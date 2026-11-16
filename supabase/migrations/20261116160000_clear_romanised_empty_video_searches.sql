-- A typed question no catalog line names was searched with its raw typed words ("kachra prabandhan"), which real titles
-- ("कचरा प्रबंधन", "Waste Management") do not share, so every result was dropped and the topic was remembered as empty
-- (found = 0) for days. Until now every free. topic key came from the typed letters; the key now comes from the tutor's
-- English term. Clears the empty rows of the free. topics, so they are searched again with the real topic term.
-- Only the negative cache: no picks and no search that found something is touched. No child's data in this table.
delete from content.video_topic_searches where found = 0 and topic_key like 'free.%';
