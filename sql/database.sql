CREATE DATABASE IF NOT EXISTS redisresearch;

USE redisresearch;

CREATE TABLE `images` (
  `id` int(11) NOT NULL,
  `album` int(11) NOT NULL,
  `value` int(11) NOT NULL,
  `image` longblob NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE `images`
  ADD PRIMARY KEY (`id`);

CREATE TABLE `metadata_query` (
  `redisKey` varchar(255) NOT NULL,
  `query` varchar(510) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE `metadata_query`
  ADD PRIMARY KEY (`redisKey`);

CREATE TABLE `metadata_primarykey` (
  `redisKey` varchar(255) NOT NULL,
  `primaryKey` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE `metadata_primarykey`
  ADD PRIMARY KEY (`redisKey`);

ALTER TABLE `metadata_primarykey`
  ADD CONSTRAINT `metadata_primarykey_ibfk_1` FOREIGN KEY (`redisKey`) REFERENCES `metadata_query` (`redisKey`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `metadata_column` (
  `redisKey` varchar(255) NOT NULL,
  `tableName` varchar(255) NOT NULL,
  `columnName` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE `metadata_column`
  ADD PRIMARY KEY (`redisKey`,`tableName`,`columnName`);

ALTER TABLE `metadata_column`
  ADD CONSTRAINT `metadata_column_ibfk_1` FOREIGN KEY (`redisKey`) REFERENCES `metadata_query` (`redisKey`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `metadata_columncondition` (
  `redisKey` varchar(255) NOT NULL,
  `tableName` varchar(255) NOT NULL,
  `columnName` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE `metadata_columncondition`
  ADD PRIMARY KEY (`redisKey`,`tableName`,`columnName`);

ALTER TABLE `metadata_columncondition`
  ADD CONSTRAINT `metadata_columnconditions_ibfk_1` FOREIGN KEY (`redisKey`) REFERENCES `metadata_query` (`redisKey`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `metadata_row` (
  `redisKey` varchar(255) NOT NULL,
  `tableName` varchar(255) NOT NULL,
  `row` varchar(255) NOT NULL,
  `rowOrder` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE `metadata_row`
  ADD PRIMARY KEY (`redisKey`,`tableName`,`row`, `rowOrder`);

ALTER TABLE `metadata_row`
  ADD CONSTRAINT `metadata_row_ibfk_1` FOREIGN KEY (`redisKey`) REFERENCES `metadata_query` (`redisKey`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `testtable` (
  `id` int(11) NOT NULL,
  `info` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE `testtable`
  ADD PRIMARY KEY (`id`);

INSERT INTO `testtable` (`id`,`info`) VALUES (1, 100);

COMMIT;